import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { serialize } from "../../../../utils/serialize.js";

vi.mock("../../../currencies/services/read.service.js", () => ({ getExchangeRate: vi.fn() }));
vi.mock("../../../currencies/providers/binance/services/read.service.js", () => ({
  getCryptoUsdtPrice: vi.fn()
}));
vi.mock("../../../currencies/providers/binance/binance.client.js", () => ({
  getBinanceTickerFetchedAt: vi.fn()
}));

const { getExchangeRate } = await import("../../../currencies/services/read.service.js");
const { getCryptoUsdtPrice } = await import("../../../currencies/providers/binance/services/read.service.js");
const { getBinanceTickerFetchedAt } = await import("../../../currencies/providers/binance/binance.client.js");
const { getAccountHoldings, valueHoldingsForAccounts } = await import("../holdings.read.service.js");

const rateMock = vi.mocked(getExchangeRate);
const priceMock = vi.mocked(getCryptoUsdtPrice);
const fetchedAtMock = vi.mocked(getBinanceTickerFetchedAt);
const dec = (value: string) => new Prisma.Decimal(value);
const FETCHED_AT = new Date("2026-11-16T10:00:00Z");

function row(code: string, extra: Record<string, unknown> = {}) {
  return {
    id: `h-${code}`,
    userId: "user-1",
    accountId: "acc-1",
    kind: "crypto",
    code,
    quantity: dec("1"),
    manualUnitPrice: null,
    manualPriceCurrency: null,
    manualPricedAt: null,
    ...extra
  };
}

function seed(holdings: unknown[], account: Record<string, unknown> = {}) {
  prismaMock.account.findFirst.mockResolvedValue({
    id: "acc-1",
    currency: "USD",
    initialBalance: dec("0"),
    ...account
  } as never);
  prismaMock.transaction.findMany.mockResolvedValue([]);
  prismaMock.holding.findMany.mockResolvedValue(holdings as never);
}

beforeEach(() => {
  rateMock.mockImplementation(async (from, to) => (from === to ? 1 : from === "USDT" && to === "USD" ? 1 : 17));
  priceMock.mockResolvedValue(60000);
  fetchedAtMock.mockReturnValue(FETCHED_AT);
});

describe("getAccountHoldings", () => {
  it("throws a 404 for an account the user does not own, scoping the lookup by userId", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    await expect(getAccountHoldings("user-1", "other")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "other", userId: "user-1" } })
    );
    expect(prismaMock.holding.findMany).not.toHaveBeenCalled();
  });

  it("scopes holdings and transactions by user and account and returns exact strings with the aggregate", async () => {
    seed(
      [
        row("USD", { kind: "fiat", quantity: dec("250") }),
        row("BTC", { quantity: dec("0.010000000000000001") })
      ],
      { initialBalance: dec("1000") }
    );

    const body = serialize(await getAccountHoldings("user-1", "acc-1"));

    expect(prismaMock.holding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", accountId: { in: ["acc-1"] } } })
    );
    expect(prismaMock.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", OR: [{ accountId: "acc-1" }, { transferToAccountId: "acc-1" }] }
      })
    );
    expect(body.holdings[1]).toMatchObject({
      code: "BTC",
      quantity: "0.010000000000000001",
      manualUnitPrice: null,
      valuation: { source: "market", unitPrice: "60000", priceCurrency: "USDT", valuedAt: FETCHED_AT.toISOString() }
    });
    expect(body.valuation).toEqual({
      currency: "USD",
      value: "850.00",
      status: "complete",
      missingCount: 0,
      netDeposited: "1000"
    });
  });

  it("returns an empty list and a zero aggregate for an account without holdings", async () => {
    seed([]);
    const body = await getAccountHoldings("user-1", "acc-1");
    expect(body.holdings).toEqual([]);
    expect(body.valuation).toMatchObject({ value: "0.00", status: "complete", missingCount: 0 });
  });

  it("values a market holding in an MXN account through the existing rate", async () => {
    seed([row("BTC", { quantity: dec("0.5") })], { currency: "MXN" });
    rateMock.mockImplementation(async (from, to) => (from === "USDT" && to === "MXN" ? 17 : 1));
    const body = await getAccountHoldings("user-1", "acc-1");
    expect(body.holdings[0]!.valuation).toMatchObject({ unitPrice: "60000", priceCurrency: "USDT", value: "510000.00" });
  });

  it("lets a manual price win over the market and keeps its own time; clearing it falls back to market", async () => {
    const pricedAt = new Date("2025-01-01T00:00:00Z");
    seed([row("BTC", { manualUnitPrice: dec("55000"), manualPriceCurrency: "USD", manualPricedAt: pricedAt })]);
    const overridden = (await getAccountHoldings("user-1", "acc-1")).holdings[0]!;
    expect(overridden.valuation).toMatchObject({ source: "manual", unitPrice: "55000", value: "55000.00", valuedAt: pricedAt.toISOString() });
    expect(priceMock).not.toHaveBeenCalled();

    seed([row("BTC")]);
    expect((await getAccountHoldings("user-1", "acc-1")).holdings[0]!.valuation.source).toBe("market");
  });

  it("keeps using the last known price after an outage, with the original fetch time", async () => {
    seed([row("BTC")]);
    const earlier = new Date("2026-11-16T07:00:00Z");
    fetchedAtMock.mockReturnValue(earlier);
    const valuation = (await getAccountHoldings("user-1", "acc-1")).holdings[0]!.valuation;
    expect(valuation).toMatchObject({ source: "market", valuedAt: earlier.toISOString(), value: "60000.00" });
  });

  it("reports an unsupported code as missing, partial, and never 0", async () => {
    seed([row("USD", { kind: "fiat", quantity: dec("100") }), row("XYZ")]);
    priceMock.mockResolvedValue(null);
    const body = await getAccountHoldings("user-1", "acc-1");
    expect(body.holdings[1]!.valuation).toMatchObject({ value: null, missingReason: "unsupported", source: null });
    expect(body.valuation).toMatchObject({ value: "100.00", status: "partial", missingCount: 1 });
  });

  it("reports price_unavailable, not 0, when the price lookup throws with no data", async () => {
    seed([row("BTC")]);
    priceMock.mockRejectedValue(new Error("Binance responded with 503"));
    const body = await getAccountHoldings("user-1", "acc-1");
    expect(body.holdings[0]!.valuation).toMatchObject({ value: null, missingReason: "price_unavailable" });
    expect(body.valuation).toMatchObject({ value: "0.00", status: "partial" });
  });

  it("reports rate_unavailable when the conversion fails without failing the request", async () => {
    seed([row("BTC", { manualUnitPrice: dec("1"), manualPriceCurrency: "XXX" })]);
    rateMock.mockRejectedValue(new Error("no rate"));
    const body = await getAccountHoldings("user-1", "acc-1");
    expect(body.holdings[0]!.valuation.missingReason).toBe("rate_unavailable");
  });
});

describe("valueHoldingsForAccounts", () => {
  it("issues one scoped holding query for many accounts and returns null for accounts without holdings", async () => {
    prismaMock.holding.findMany.mockResolvedValue([row("BTC")] as never);
    const result = await valueHoldingsForAccounts("user-1", [
      { id: "acc-1", currency: "USD", currentBalance: dec("5") },
      { id: "acc-2", currency: "USD", currentBalance: dec("7") }
    ]);

    expect(prismaMock.holding.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.holding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", accountId: { in: ["acc-1", "acc-2"] } } })
    );
    expect(result.get("acc-1")).toMatchObject({ value: "60000.00", netDeposited: "5" });
    expect(result.get("acc-2")).toBeNull();
  });

  it("does not query when there are no accounts", async () => {
    expect((await valueHoldingsForAccounts("user-1", [])).size).toBe(0);
    expect(prismaMock.holding.findMany).not.toHaveBeenCalled();
  });
});
