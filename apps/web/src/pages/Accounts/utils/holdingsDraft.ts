import {
  HOLDING_KINDS_BY_ACCOUNT_TYPE,
  type AccountType,
  type Holding,
  type HoldingKind
} from "@flowledger/shared";
import type { FormErrors } from "../../../types/common.types";
import type { HoldingUpsert, HoldingsChangeSet } from "../../../types/accounts.types";
import { amountPrecisionError } from "../../../utils/currency";
import {
  transactionDateInputValue,
  transactionDateRequestValue
} from "../../../utils/dateTime";
import { isIsoCurrency } from "../../../utils/money";
import type {
  AccountDraft,
  HoldingDraft,
  HoldingPriceSource
} from "../types/accounts.types";

const POSITIVE_DECIMAL = /^\d+(\.\d+)?$/;

const SYMBOL = /^[A-Z0-9]{2,10}$/;
const TICKER = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

/** Asset kinds a holdings account of `type` accepts, in selector order; empty for types without holdings. */
export function allowedHoldingKinds(type: AccountType): readonly HoldingKind[] {
  return (
    (HOLDING_KINDS_BY_ACCOUNT_TYPE as Partial<Record<AccountType, readonly HoldingKind[]>>)[
      type
    ] ?? []
  );
}

/** The price source a saved holding is shown with: Binance for crypto without a manual price, otherwise manual. */
function savedPriceSource(holding: Holding): HoldingPriceSource {
  return holding.kind === "crypto" && !holding.manualUnitPrice ? "automatic" : "manual";
}

/** Builds the draft rows for the saved holdings; a saved row's `draftId` is its id. */
export function holdingsToDrafts(holdings: Holding[]): HoldingDraft[] {
  return holdings.map((holding) => ({
    draftId: holding.id,
    id: holding.id,
    kind: holding.kind,
    code: holding.code ?? "",
    name: holding.name ?? "",
    unit: holding.unit ?? "",
    priceSource: savedPriceSource(holding),
    quantity: holding.quantity,
    manualUnitPrice: holding.manualUnitPrice ?? "",
    manualPriceCurrency: holding.manualPriceCurrency ?? "",
    manualPricedAt: holding.manualPricedAt
      ? transactionDateInputValue({ date: holding.manualPricedAt })
      : "",
    valuation: holding.valuation
  }));
}

/** An empty unsaved row of `kind`: crypto starts on the automatic Binance price, stock/ETF/other are manual-only; its manual price currency defaults to the account currency. */
export function newHoldingDraft(
  kind: HoldingKind,
  currency: string
): HoldingDraft {
  return {
    draftId: crypto.randomUUID(),
    id: null,
    kind,
    code: "",
    name: "",
    unit: "",
    priceSource: kind === "crypto" ? "automatic" : "manual",
    quantity: "",
    manualUnitPrice: "",
    manualPriceCurrency: currency,
    manualPricedAt: "",
    valuation: null
  };
}

/** The manual price a row will send: blank unless it is a priced kind on the manual source. */
function effectivePrice(row: HoldingDraft): string {
  return row.kind !== "fiat" && row.priceSource === "manual"
    ? row.manualUnitPrice.trim()
    : "";
}

function manualFieldsChanged(row: HoldingDraft, saved: Holding): boolean {
  const price = effectivePrice(row);
  return (
    price !== (saved.manualUnitPrice ?? "") ||
    (price !== "" &&
      (row.manualPriceCurrency !== (saved.manualPriceCurrency ?? "") ||
        row.manualPricedAt !==
          (saved.manualPricedAt
            ? transactionDateInputValue({ date: saved.manualPricedAt })
            : "")))
  );
}

/** Whether a row differs from its saved holding in anything that changes its value (trimmed quantity or manual valuation); a new row always does. */
export function isHoldingRowEdited(
  row: HoldingDraft,
  saved: Holding | undefined
): boolean {
  if (!saved) return true;
  return row.quantity.trim() !== saved.quantity || manualFieldsChanged(row, saved);
}

function manualFields(
  row: HoldingDraft,
  original?: { date: string }
): HoldingUpsert {
  const pricedAt = row.manualPricedAt
    ? transactionDateRequestValue(row.manualPricedAt, original)
    : undefined;
  return {
    manualUnitPrice: effectivePrice(row),
    manualPriceCurrency: row.manualPriceCurrency,
    ...(pricedAt ? { manualPricedAt: pricedAt } : {})
  };
}

function newHoldingUpsert(row: HoldingDraft): HoldingUpsert {
  const item: HoldingUpsert = { kind: row.kind, quantity: row.quantity.trim() };
  if (row.kind === "other") {
    item.name = row.name.trim();
    if (row.unit.trim()) item.unit = row.unit.trim();
  } else {
    item.code = row.code.trim().toUpperCase();
  }
  return effectivePrice(row) ? { ...item, ...manualFields(row) } : item;
}

/**
 * Computes the one holdings change set for a Save: new rows (kind, code or name/unit, quantity and, for a manual
 * price source, the manual price), changed saved rows (`id` plus only the fields that changed: the trimmed quantity,
 * and the manual price fields only when the manual valuation changed; switching a crypto row back to the automatic
 * source sends `manualUnitPrice: null`) and removed saved ids. Untouched rows are omitted, so the API leaves them alone.
 */
export function buildHoldingsChangeSet(
  rows: HoldingDraft[],
  saved: Holding[]
): HoldingsChangeSet {
  const savedById = new Map(saved.map((holding) => [holding.id, holding]));
  const upsert: HoldingUpsert[] = [];
  for (const row of rows) {
    if (!row.id) {
      upsert.push(newHoldingUpsert(row));
      continue;
    }
    const original = savedById.get(row.id);
    if (!original || !isHoldingRowEdited(row, original)) continue;
    const item: HoldingUpsert = { id: row.id };
    if (row.quantity.trim() !== original.quantity) item.quantity = row.quantity.trim();
    if (manualFieldsChanged(row, original)) {
      if (effectivePrice(row)) {
        Object.assign(
          item,
          manualFields(
            row,
            original.manualPricedAt ? { date: original.manualPricedAt } : undefined
          )
        );
      } else {
        item.manualUnitPrice = null;
      }
    }
    upsert.push(item);
  }
  const kept = new Set(rows.map((row) => row.id));
  const remove = saved.filter((holding) => !kept.has(holding.id)).map((h) => h.id);
  return { upsert, remove };
}

function positiveDecimalError(value: string): string | null {
  const text = value.trim();
  if (!POSITIVE_DECIMAL.test(text) || !/[1-9]/.test(text))
    return "Enter a number greater than 0";
  return null;
}

/** Validates the holdings rows; errors are keyed `holdings.<index>.<field>` (field: code, name, unit, quantity, manualUnitPrice, manualPriceCurrency, manualPricedAt). Code rules follow the kind (crypto symbol, stock/ETF ticker, fiat ISO currency); `other` needs a name. A manual source needs a price. Precision errors reuse the shared amount-precision messages. */
export function validateHoldingRows(rows: HoldingDraft[]): FormErrors {
  const errors: FormErrors = {};
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = (field: string) => `holdings.${index}.${field}`;
    const code = row.code.trim().toUpperCase();
    if (!row.id) {
      if (row.kind === "other") {
        if (!row.name.trim()) errors[key("name")] = "Enter a name";
        else if (row.name.trim().length > 80) errors[key("name")] = "At most 80 characters";
        if (row.unit.trim().length > 20) errors[key("unit")] = "At most 20 characters";
      } else if (row.kind === "fiat") {
        if (!isIsoCurrency(code)) errors[key("code")] = "Choose a cash currency";
      } else if (row.kind === "crypto") {
        if (!SYMBOL.test(code)) errors[key("code")] = "Enter a code such as BTC";
        else if (isIsoCurrency(code))
          errors[key("code")] = "Use Cash for fiat currencies";
      } else if (!TICKER.test(code)) {
        errors[key("code")] = "Enter a ticker such as AAPL";
      }
    }
    if (row.kind !== "other") {
      const identity = `${row.kind}:${code}`;
      if (code && seen.has(identity)) errors[key("code")] ??= `${code} is already listed`;
      seen.add(identity);
    }

    const quantityError = positiveDecimalError(row.quantity);
    if (quantityError) errors[key("quantity")] = quantityError;
    else if (code && (row.kind === "crypto" || row.kind === "fiat")) {
      const precision = amountPrecisionError(row.quantity, code);
      if (precision) errors[key("quantity")] = precision;
    }

    if (row.kind !== "fiat" && row.priceSource === "manual") {
      if (row.manualUnitPrice.trim() === "") {
        errors[key("manualUnitPrice")] = "Enter a price";
      } else {
        const priceError = positiveDecimalError(row.manualUnitPrice);
        if (priceError) errors[key("manualUnitPrice")] = priceError;
        else if ((row.manualUnitPrice.split(".")[1] ?? "").length > 18)
          errors[key("manualUnitPrice")] = "At most 18 decimal places";
      }
      if (!row.manualPriceCurrency)
        errors[key("manualPriceCurrency")] = "Set the currency of the manual price";
      if (row.manualPricedAt && new Date(row.manualPricedAt).getTime() > Date.now())
        errors[key("manualPricedAt")] = "The valuation date cannot be in the future";
    }
  });
  return errors;
}

/** Appends a new empty row to the draft: crypto in a crypto account, a stock in any other holdings account. */
export function addHoldingRow(draft: AccountDraft): AccountDraft {
  const kind = draft.type === "crypto" ? "crypto" : "stock";
  return {
    ...draft,
    holdings: [...draft.holdings, newHoldingDraft(kind, draft.currency)]
  };
}

/** Applies `patch` to the row with `draftId`. */
export function patchHoldingRow(
  draft: AccountDraft,
  draftId: string,
  patch: Partial<HoldingDraft>
): AccountDraft {
  return {
    ...draft,
    holdings: draft.holdings.map((row) =>
      row.draftId === draftId ? { ...row, ...patch } : row
    )
  };
}

/** Removes the row with `draftId`; a saved row is deleted on Save. */
export function removeHoldingRow(
  draft: AccountDraft,
  draftId: string
): AccountDraft {
  return {
    ...draft,
    holdings: draft.holdings.filter((row) => row.draftId !== draftId)
  };
}
