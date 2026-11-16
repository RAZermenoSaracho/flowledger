import type { Holding } from "@flowledger/shared";
import { describe, expect, it } from "vitest";
import type { AccountDraft } from "../../types/accounts.types";
import {
  addHoldingRow,
  buildHoldingsChangeSet,
  holdingsToDrafts,
  isHoldingRowEdited,
  newHoldingDraft,
  patchHoldingRow,
  removeHoldingRow,
  validateHoldingRows
} from "../holdingsDraft";

const valuation = {
  source: "market" as const,
  unitPrice: "60000",
  priceCurrency: "USDT",
  valuedAt: "2026-11-01T00:00:00.000Z",
  value: "600",
  missingReason: null
};

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h1",
    accountId: "a1",
    kind: "crypto",
    code: "BTC",
    quantity: "0.01",
    manualUnitPrice: null,
    manualPriceCurrency: null,
    manualPricedAt: null,
    valuation,
    ...overrides
  };
}

describe("buildHoldingsChangeSet", () => {
  it("is empty when nothing changed", () => {
    const saved = [holding()];
    expect(buildHoldingsChangeSet(holdingsToDrafts(saved), saved)).toEqual({
      upsert: [],
      remove: []
    });
  });

  it("sends new rows, changed quantity and removed ids only", () => {
    const saved = [holding(), holding({ id: "h2", code: "ETH" })];
    const rows = holdingsToDrafts(saved);
    rows[0]!.quantity = "0.5";
    const added = { ...newHoldingDraft("fiat", "USD"), code: "usd", quantity: "200" };
    expect(buildHoldingsChangeSet([rows[0]!, added], saved)).toEqual({
      upsert: [
        { id: "h1", quantity: "0.5" },
        { kind: "fiat", code: "USD", quantity: "200" }
      ],
      remove: ["h2"]
    });
  });

  it("sends null when a saved manual price is cleared", () => {
    const saved = [
      holding({
        manualUnitPrice: "5",
        manualPriceCurrency: "USD",
        manualPricedAt: "2026-10-01T00:00:00.000Z"
      })
    ];
    const rows = holdingsToDrafts(saved);
    rows[0]!.manualUnitPrice = "";
    rows[0]!.manualPricedAt = "";
    expect(buildHoldingsChangeSet(rows, saved).upsert).toEqual([
      { id: "h1", manualUnitPrice: null }
    ]);
  });

  it("sends a new manual price with its currency", () => {
    const saved = [holding()];
    const rows = holdingsToDrafts(saved);
    rows[0]!.manualUnitPrice = "123.45";
    rows[0]!.manualPriceCurrency = "EUR";
    expect(buildHoldingsChangeSet(rows, saved).upsert).toEqual([
      { id: "h1", manualUnitPrice: "123.45", manualPriceCurrency: "EUR" }
    ]);
  });
});

describe("buildHoldingsChangeSet minimal payloads", () => {
  const manual = {
    manualUnitPrice: "5",
    manualPriceCurrency: "USD",
    manualPricedAt: "2026-10-01T00:00:00.000Z"
  };

  it("ignores whitespace-only quantity changes", () => {
    const saved = [holding()];
    const rows = holdingsToDrafts(saved);
    rows[0]!.quantity = " 0.01 ";
    expect(buildHoldingsChangeSet(rows, saved).upsert).toEqual([]);
  });

  it("sends only id and quantity for a quantity edit on a manually priced row", () => {
    const saved = [holding(manual)];
    const rows = holdingsToDrafts(saved);
    rows[0]!.quantity = "0.02";
    expect(buildHoldingsChangeSet(rows, saved).upsert).toEqual([
      { id: "h1", quantity: "0.02" }
    ]);
  });

  it("sends the manual fields when the price changes, and null when cleared", () => {
    const saved = [holding(manual)];
    const rows = holdingsToDrafts(saved);
    rows[0]!.manualUnitPrice = "6";
    const [item] = buildHoldingsChangeSet(rows, saved).upsert;
    expect(item).toMatchObject({ id: "h1", manualUnitPrice: "6", manualPriceCurrency: "USD" });
    expect(item).not.toHaveProperty("quantity");
    rows[0]!.manualUnitPrice = "";
    expect(buildHoldingsChangeSet(rows, saved).upsert).toEqual([
      { id: "h1", manualUnitPrice: null }
    ]);
  });
});

describe("isHoldingRowEdited", () => {
  it("treats a new row as edited and an unchanged saved row as clean", () => {
    const saved = holding();
    expect(isHoldingRowEdited(holdingsToDrafts([saved])[0]!, saved)).toBe(false);
    expect(isHoldingRowEdited(newHoldingDraft("crypto", "USD"), undefined)).toBe(true);
  });
});

describe("validateHoldingRows", () => {
  it("reports precision, duplicates and bad codes per row", () => {
    const rows = [
      { ...newHoldingDraft("fiat", "USD"), code: "USD", quantity: "1.234" },
      { ...newHoldingDraft("fiat", "USD"), code: "USD", quantity: "5" },
      { ...newHoldingDraft("fiat", "USD"), code: "ZZZ", quantity: "0" }
    ];
    const errors = validateHoldingRows(rows);
    expect(errors["holdings.0.quantity"]).toBe("USD allows at most 2 decimal places");
    expect(errors["holdings.1.code"]).toBe("USD is already listed");
    expect(errors["holdings.2.code"]).toBe("Cash must use an ISO 4217 currency code");
    expect(errors["holdings.2.quantity"]).toBe("Enter a number greater than 0");
  });

  it("accepts 18 crypto decimals and a manual price with a currency", () => {
    const row = {
      ...newHoldingDraft("crypto", "USD"),
      code: "BTC",
      quantity: "0.123456789012345678",
      manualUnitPrice: "60000"
    };
    expect(validateHoldingRows([row])).toEqual({});
    expect(validateHoldingRows([{ ...row, manualPriceCurrency: "" }])).toEqual({
      "holdings.0.manualPriceCurrency": "Set the currency of the manual price"
    });
  });
});

describe("row reducers", () => {
  const draft = { currency: "USD", holdings: [] } as unknown as AccountDraft;

  it("adds, patches and removes a row", () => {
    const added = addHoldingRow(draft);
    const id = added.holdings[0]!.draftId;
    const patched = patchHoldingRow(added, id, { code: "BTC" });
    expect(patched.holdings[0]!.code).toBe("BTC");
    expect(removeHoldingRow(patched, id).holdings).toEqual([]);
  });
});
