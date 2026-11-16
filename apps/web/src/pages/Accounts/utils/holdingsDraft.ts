import type { Holding } from "@flowledger/shared";
import type { FormErrors } from "../../../types/common.types";
import type { HoldingUpsert, HoldingsChangeSet } from "../../../types/accounts.types";
import { amountPrecisionError } from "../../../utils/currency";
import {
  transactionDateInputValue,
  transactionDateRequestValue
} from "../../../utils/dateTime";
import { isIsoCurrency } from "../../../utils/money";
import type { AccountDraft, HoldingDraft } from "../types/accounts.types";

const POSITIVE_DECIMAL = /^\d+(\.\d+)?$/;

/** Builds the draft rows for the saved holdings; a saved row's `draftId` is its id. */
export function holdingsToDrafts(holdings: Holding[]): HoldingDraft[] {
  return holdings.map((holding) => ({
    draftId: holding.id,
    id: holding.id,
    kind: holding.kind,
    code: holding.code,
    quantity: holding.quantity,
    manualUnitPrice: holding.manualUnitPrice ?? "",
    manualPriceCurrency: holding.manualPriceCurrency ?? "",
    manualPricedAt: holding.manualPricedAt
      ? transactionDateInputValue({ date: holding.manualPricedAt })
      : "",
    valuation: holding.valuation
  }));
}

/** An empty unsaved row; its manual price currency defaults to the account currency. */
export function newHoldingDraft(
  kind: HoldingDraft["kind"],
  currency: string
): HoldingDraft {
  return {
    draftId: crypto.randomUUID(),
    id: null,
    kind,
    code: "",
    quantity: "",
    manualUnitPrice: "",
    manualPriceCurrency: currency,
    manualPricedAt: "",
    valuation: null
  };
}

function manualFieldsChanged(row: HoldingDraft, saved: Holding): boolean {
  return (
    row.manualUnitPrice.trim() !== (saved.manualUnitPrice ?? "") ||
    (row.manualUnitPrice.trim() !== "" &&
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
    manualUnitPrice: row.manualUnitPrice.trim(),
    manualPriceCurrency: row.manualPriceCurrency,
    ...(pricedAt ? { manualPricedAt: pricedAt } : {})
  };
}

/**
 * Computes the one holdings change set for a Save: new rows (kind, code, quantity and any manual price), changed
 * saved rows (`id` plus only the fields that changed: the trimmed quantity, and the manual price fields only when
 * the manual valuation changed; an emptied price becomes `null`) and removed saved ids. Untouched rows are omitted,
 * so the API leaves them alone.
 */
export function buildHoldingsChangeSet(
  rows: HoldingDraft[],
  saved: Holding[]
): HoldingsChangeSet {
  const savedById = new Map(saved.map((holding) => [holding.id, holding]));
  const upsert: HoldingUpsert[] = [];
  for (const row of rows) {
    const hasPrice = row.manualUnitPrice.trim() !== "";
    if (!row.id) {
      upsert.push({
        kind: row.kind,
        code: row.code.trim().toUpperCase(),
        quantity: row.quantity.trim(),
        ...(hasPrice ? manualFields(row) : {})
      });
      continue;
    }
    const original = savedById.get(row.id);
    if (!original || !isHoldingRowEdited(row, original)) continue;
    const item: HoldingUpsert = { id: row.id };
    if (row.quantity.trim() !== original.quantity) item.quantity = row.quantity.trim();
    const manualChanged = manualFieldsChanged(row, original);
    if (manualChanged && hasPrice) {
      Object.assign(
        item,
        manualFields(
          row,
          original.manualPricedAt ? { date: original.manualPricedAt } : undefined
        )
      );
    } else if (manualChanged) {
      item.manualUnitPrice = null;
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

/** Validates the holdings rows; errors are keyed `holdings.<index>.<field>` (field: code, quantity, manualUnitPrice, manualPriceCurrency, manualPricedAt). Precision errors reuse the shared amount-precision messages. */
export function validateHoldingRows(rows: HoldingDraft[]): FormErrors {
  const errors: FormErrors = {};
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = (field: string) => `holdings.${index}.${field}`;
    const code = row.code.trim().toUpperCase();
    if (!row.id) {
      if (!/^[A-Z0-9]{2,10}$/.test(code)) errors[key("code")] = "Enter a code such as BTC or USD";
      else if (row.kind === "fiat" && !isIsoCurrency(code))
        errors[key("code")] = "Cash must use an ISO 4217 currency code";
    }
    const identity = `${row.kind}:${code}`;
    if (code && seen.has(identity)) errors[key("code")] ??= `${code} is already listed`;
    seen.add(identity);

    const quantityError = positiveDecimalError(row.quantity);
    if (quantityError) errors[key("quantity")] = quantityError;
    else if (code) {
      const precision = amountPrecisionError(row.quantity, code);
      if (precision) errors[key("quantity")] = precision;
    }

    if (row.kind === "crypto" && row.manualUnitPrice.trim() !== "") {
      const priceError = positiveDecimalError(row.manualUnitPrice);
      if (priceError) errors[key("manualUnitPrice")] = priceError;
      else if ((row.manualUnitPrice.split(".")[1] ?? "").length > 18)
        errors[key("manualUnitPrice")] = "At most 18 decimal places";
      if (!row.manualPriceCurrency)
        errors[key("manualPriceCurrency")] = "Set the currency of the manual price";
      if (row.manualPricedAt && new Date(row.manualPricedAt).getTime() > Date.now())
        errors[key("manualPricedAt")] = "The valuation date cannot be in the future";
    }
  });
  return errors;
}

/** Appends a new empty row (a crypto asset by default) to the draft. */
export function addHoldingRow(draft: AccountDraft): AccountDraft {
  return {
    ...draft,
    holdings: [...draft.holdings, newHoldingDraft("crypto", draft.currency)]
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
