import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { HoldingQuote, HoldingValuationInput } from "../../types/holdings.types.js";
import { valueHoldings } from "../holdingValuation.js";

const D = (value: string) => new Prisma.Decimal(value);

function holding(overrides: Partial<HoldingValuationInput> & { code: string }): HoldingValuationInput {
  return {
    id: `h-${overrides.code}`,
    kind: "crypto",
    quantity: D("1"),
    manualUnitPrice: null,
    manualPriceCurrency: null,
    manualPricedAt: null,
    ...overrides
  };
}

function deps(quotes: Record<string, HoldingQuote> = {}, rates: Record<string, number> = {}) {
  const quote = vi.fn(async (code: string) => quotes[code] ?? { unsupported: true as const });
  const rate = vi.fn(async (from: string, to: string) => {
    const found = rates[`${from}>${to}`];
    if (found === undefined) throw new Error("no rate");
    return found;
  });
  return { quote, rate };
}

describe("valueHoldings", () => {
  it("values fiat at par with no timestamp", async () => {
    const result = await valueHoldings([holding({ kind: "fiat", code: "USD", quantity: D("250.5") })], "USD", deps());
    expect(result.valuations[0]).toEqual({
      source: "cash",
      unitPrice: "1",
      priceCurrency: "USD",
      valuedAt: null,
      value: "250.50",
      missingReason: null
    });
    expect(result.value.toFixed(2)).toBe("250.50");
  });

  it("converts a manual price in another currency and keeps the price currency", async () => {
    const pricedAt = new Date("2025-01-01T00:00:00Z");
    const result = await valueHoldings(
      [
        holding({
          code: "BTC",
          quantity: D("0.5"),
          manualUnitPrice: D("60000"),
          manualPriceCurrency: "USD",
          manualPricedAt: pricedAt
        })
      ],
      "MXN",
      deps({}, { "USD>MXN": 17 })
    );
    expect(result.valuations[0]).toMatchObject({
      source: "manual",
      unitPrice: "60000",
      priceCurrency: "USD",
      valuedAt: pricedAt.toISOString(),
      value: "510000.00"
    });
  });

  it("counts a manual price from 400 days ago with no flag", async () => {
    const old = new Date(Date.now() - 400 * 86_400_000);
    const result = await valueHoldings(
      [holding({ code: "BTC", manualUnitPrice: D("100"), manualPriceCurrency: "USD", manualPricedAt: old })],
      "USD",
      deps()
    );
    expect(result.valuations[0]!.value).toBe("100.00");
    expect(result.valuations[0]!.valuedAt).toBe(old.toISOString());
    expect(result.missingCount).toBe(0);
  });

  it("lets a manual price win over the market quote", async () => {
    const d = deps({ BTC: { price: 60000, currency: "USDT", fetchedAt: null } }, { "USDT>USD": 1 });
    const result = await valueHoldings(
      [holding({ code: "BTC", manualUnitPrice: D("55000"), manualPriceCurrency: "USD" })],
      "USD",
      d
    );
    expect(result.valuations[0]!.source).toBe("manual");
    expect(d.quote).not.toHaveBeenCalled();
  });

  it("uses the market quote in its own currency with the fetch time", async () => {
    const fetchedAt = new Date("2026-01-01T10:00:00Z");
    const result = await valueHoldings(
      [holding({ code: "BTC", quantity: D("0.5") })],
      "USD",
      deps({ BTC: { price: 60000, currency: "USDT", fetchedAt } }, { "USDT>USD": 1 })
    );
    expect(result.valuations[0]).toMatchObject({
      source: "market",
      unitPrice: "60000",
      priceCurrency: "USDT",
      valuedAt: fetchedAt.toISOString(),
      value: "30000.00"
    });
  });

  it("reports each missing reason and never values a missing holding at 0", async () => {
    const d = deps({ ETH: { unavailable: true }, BTC: { price: 1, currency: "USDT", fetchedAt: null } });
    const result = await valueHoldings(
      [
        holding({ code: "XYZ" }),
        holding({ code: "ETH" }),
        holding({ code: "BTC" }),
        holding({ kind: "fiat", code: "EUR" })
      ],
      "USD",
      d
    );
    expect(result.valuations.map((v) => v.missingReason)).toEqual([
      "unsupported",
      "price_unavailable",
      "rate_unavailable",
      "rate_unavailable"
    ]);
    expect(result.valuations.every((v) => v.value === null)).toBe(true);
    expect(result.missingCount).toBe(4);
    expect(result.value.toFixed(2)).toBe("0.00");
  });

  it("sums only the known holdings and counts the missing ones", async () => {
    const result = await valueHoldings(
      [holding({ kind: "fiat", code: "USD", quantity: D("100") }), holding({ code: "XYZ" })],
      "USD",
      deps()
    );
    expect(result.value.toFixed(2)).toBe("100.00");
    expect(result.missingCount).toBe(1);
  });

  it("rounds the aggregate once: three thirds sum to 1.00, not 0.99", async () => {
    const third = (code: string) =>
      holding({ code, manualUnitPrice: D("1"), manualPriceCurrency: "AAA" });
    const result = await valueHoldings([third("A"), third("B"), third("C")].map((h) => ({ ...h, quantity: D("1") })), "USD", {
      ...deps(),
      rate: async () => 1 / 3
    });
    expect(result.valuations.map((v) => v.value)).toEqual(["0.33", "0.33", "0.33"]);
    expect(result.value.toFixed(2)).toBe("1.00");
  });

  it("keeps 18-decimal quantities exact", async () => {
    const result = await valueHoldings(
      [holding({ code: "ETH", quantity: D("1.234567890123456789"), manualUnitPrice: D("1"), manualPriceCurrency: "ETH" })],
      "ETH",
      deps()
    );
    expect(result.valuations[0]!.value).toBe("1.234567890123456789");
    expect(result.value.toFixed(18)).toBe("1.234567890123456789");
  });

  it("rounds to the account currency's minor units (JPY 0, MXN 2)", async () => {
    const h = [holding({ kind: "fiat", code: "USD", quantity: D("1.01") })];
    const jpy = await valueHoldings(h, "JPY", deps({}, { "USD>JPY": 150.5 }));
    expect(jpy.valuations[0]!.value).toBe("152");
    expect(jpy.value.toFixed(0)).toBe("152");
    const mxn = await valueHoldings(h, "MXN", deps({}, { "USD>MXN": 17.255 }));
    expect(mxn.valuations[0]!.value).toBe("17.43");
  });

  it("looks each rate pair up once per call", async () => {
    const d = deps({}, { "USD>MXN": 17 });
    await valueHoldings(
      [
        holding({ kind: "fiat", code: "USD", quantity: D("1") }),
        holding({ code: "A", manualUnitPrice: D("2"), manualPriceCurrency: "USD" }),
        holding({ code: "B", manualUnitPrice: D("3"), manualPriceCurrency: "USD" })
      ],
      "MXN",
      d
    );
    expect(d.rate).toHaveBeenCalledTimes(1);
  });
});
