import type { Holding } from "@flowledger/shared";
import { describe, expect, it } from "vitest";
import type { AccountDraft } from "../../types/accounts.types";
import {
  addHoldingRow,
  allowedHoldingKinds,
  buildHoldingsChangeSet,
  holdingsToDrafts,
  isHoldingRowEdited,
  isHoldingType,
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
    name: null,
    unit: null,
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
    rows[0]!.priceSource = "manual";
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
    expect(errors["holdings.2.code"]).toBe("Choose a cash currency");
    expect(errors["holdings.2.quantity"]).toBe("Enter a number greater than 0");
  });

  it("accepts 18 crypto decimals and a manual price with a currency", () => {
    const row = {
      ...newHoldingDraft("crypto", "USD"),
      code: "BTC",
      priceSource: "manual" as const,
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
  const draft = { type: "investment", currency: "USD", holdings: [] } as unknown as AccountDraft;

  it("adds, patches and removes a row", () => {
    const added = addHoldingRow(draft);
    const id = added.holdings[0]!.draftId;
    const patched = patchHoldingRow(added, id, { code: "BTC" });
    expect(patched.holdings[0]!.code).toBe("BTC");
    expect(removeHoldingRow(patched, id).holdings).toEqual([]);
  });

  it("adds crypto rows to a crypto account and stock rows to an investment account", () => {
    expect(addHoldingRow({ ...draft, type: "crypto" }).holdings[0]!.kind).toBe("crypto");
    expect(addHoldingRow(draft).holdings[0]!.kind).toBe("stock");
  });
});

describe("kinds and price sources", () => {
  it("limits kinds by account type", () => {
    expect(allowedHoldingKinds("crypto")).toEqual(["crypto"]);
    expect(allowedHoldingKinds("investment")).toEqual(["crypto", "fiat", "stock", "etf", "other"]);
    expect(allowedHoldingKinds("checking")).toEqual([]);
  });

  it("starts crypto on the automatic source and everything else manual", () => {
    expect(newHoldingDraft("crypto", "MXN").priceSource).toBe("automatic");
    expect(newHoldingDraft("stock", "MXN").priceSource).toBe("manual");
    expect(newHoldingDraft("stock", "MXN").manualPriceCurrency).toBe("MXN");
  });

  it("derives the saved price source", () => {
    const [auto, manual] = holdingsToDrafts([
      holding(),
      holding({ id: "h2", manualUnitPrice: "5", manualPriceCurrency: "USD" })
    ]);
    expect(auto!.priceSource).toBe("automatic");
    expect(manual!.priceSource).toBe("manual");
  });

  it("builds a new automatic crypto row without a price", () => {
    const row = { ...newHoldingDraft("crypto", "USD"), code: "eth", quantity: "2" };
    expect(buildHoldingsChangeSet([row], []).upsert).toEqual([
      { kind: "crypto", code: "ETH", quantity: "2" }
    ]);
  });

  it("builds a new stock row with a manual price in the account currency", () => {
    const row = {
      ...newHoldingDraft("stock", "MXN"),
      code: "aapl",
      quantity: "3",
      manualUnitPrice: "190.5"
    };
    expect(buildHoldingsChangeSet([row], []).upsert).toEqual([
      { kind: "stock", code: "AAPL", quantity: "3", manualUnitPrice: "190.5", manualPriceCurrency: "MXN" }
    ]);
  });

  it("builds an other row with name and optional unit, and no code", () => {
    const row = {
      ...newHoldingDraft("other", "USD"),
      name: " Land ",
      unit: "m²",
      quantity: "120",
      manualUnitPrice: "300"
    };
    expect(buildHoldingsChangeSet([row], []).upsert).toEqual([
      {
        kind: "other",
        name: "Land",
        unit: "m²",
        quantity: "120",
        manualUnitPrice: "300",
        manualPriceCurrency: "USD"
      }
    ]);
    const noUnit = buildHoldingsChangeSet([{ ...row, unit: "" }], []).upsert[0]!;
    expect(noUnit).not.toHaveProperty("unit");
  });

  it("sends manualUnitPrice null when a manual crypto row switches to automatic", () => {
    const saved = [holding({ manualUnitPrice: "5", manualPriceCurrency: "USD" })];
    const rows = holdingsToDrafts(saved);
    rows[0]!.priceSource = "automatic";
    rows[0]!.manualUnitPrice = "";
    expect(buildHoldingsChangeSet(rows, saved).upsert).toEqual([
      { id: "h1", manualUnitPrice: null }
    ]);
  });

  it("sends the manual price when an automatic crypto row switches to manual", () => {
    const saved = [holding()];
    const rows = holdingsToDrafts(saved);
    rows[0]!.priceSource = "manual";
    rows[0]!.manualUnitPrice = "70000";
    rows[0]!.manualPriceCurrency = "USD";
    expect(buildHoldingsChangeSet(rows, saved).upsert).toEqual([
      { id: "h1", manualUnitPrice: "70000", manualPriceCurrency: "USD" }
    ]);
  });
});

describe("validateHoldingRows per kind", () => {
  it("requires a name for other and caps name and unit", () => {
    const row = { ...newHoldingDraft("other", "USD"), quantity: "1", manualUnitPrice: "5" };
    expect(validateHoldingRows([row])["holdings.0.name"]).toBe("Enter a name");
    expect(validateHoldingRows([{ ...row, name: "Land" }])).toEqual({});
    expect(validateHoldingRows([{ ...row, name: "Land", unit: "x".repeat(21) }])["holdings.0.unit"]).toBe(
      "At most 20 characters"
    );
  });

  it("requires a price for manual rows and validates tickers and crypto codes", () => {
    const stock = { ...newHoldingDraft("stock", "USD"), code: "BRK.B", quantity: "1" };
    expect(validateHoldingRows([stock])["holdings.0.manualUnitPrice"]).toBe("Enter a price");
    expect(validateHoldingRows([{ ...stock, manualUnitPrice: "1" }])).toEqual({});
    expect(validateHoldingRows([{ ...stock, code: "-X", manualUnitPrice: "1" }])["holdings.0.code"]).toBe(
      "Enter a ticker such as AAPL"
    );
    const crypto = { ...newHoldingDraft("crypto", "USD"), code: "USD", quantity: "1" };
    expect(validateHoldingRows([crypto])["holdings.0.code"]).toBe("Use Cash for fiat currencies");
  });

  it("allows several other rows with the same empty code", () => {
    const row = { ...newHoldingDraft("other", "USD"), name: "A", quantity: "1", manualUnitPrice: "1" };
    expect(validateHoldingRows([row, { ...row, name: "B" }])).toEqual({});
  });
});

describe("isHoldingType", () => {
  it("is true only for investment and crypto", () => {
    expect(isHoldingType("investment")).toBe(true);
    expect(isHoldingType("crypto")).toBe(true);
    expect(isHoldingType("checking")).toBe(false);
    expect(isHoldingType("credit_card")).toBe(false);
  });
});
