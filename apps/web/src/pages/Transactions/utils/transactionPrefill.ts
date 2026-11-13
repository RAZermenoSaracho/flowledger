import { TRANSACTION_TYPES, currencyCodeSchema, dateStringSchema } from "@flowledger/shared";
import { transactionDateInputValue } from "../../../utils/dateTime";
import type { TransactionDraft } from "../types/transactions.types";

/** The draft fields a `/transactions/new` URL may preset. */
export type TransactionPrefill = Partial<
  Pick<
    TransactionDraft,
    | "type"
    | "amount"
    | "executionCurrency"
    | "accountId"
    | "categoryId"
    | "groupId"
    | "name"
    | "date"
    | "isShared"
  >
>;

/**
 * Reads the whitelisted `/transactions/new` query params (`type`, `amount`, `currency`, `accountId`,
 * `categoryId`, `groupId`, `description`, `date`, `shared`). Unknown params and invalid values are ignored,
 * so the form opens with its default for them. `date` accepts what `dateStringSchema` accepts.
 */
export function parseTransactionPrefill(params: URLSearchParams): TransactionPrefill {
  const prefill: TransactionPrefill = {};

  if (params.get("shared") === "1") prefill.isShared = true;

  const type = params.get("type");
  const knownType = TRANSACTION_TYPES.find((item) => item === type);
  if (knownType) prefill.type = knownType;

  const amount = params.get("amount")?.trim();
  if (amount && Number.isFinite(Number(amount)) && Number(amount) > 0) {
    prefill.amount = amount;
  }

  const currency = currencyCodeSchema.safeParse(params.get("currency") ?? "");
  if (currency.success && /^[A-Z0-9]+$/.test(currency.data)) {
    prefill.executionCurrency = currency.data;
  }

  for (const [param, key] of [
    ["accountId", "accountId"],
    ["categoryId", "categoryId"],
    ["groupId", "groupId"]
  ] as const) {
    const value = params.get(param)?.trim();
    if (value) prefill[key] = value;
  }

  const description = params.get("description")?.trim();
  if (description && description.length <= 160) prefill.name = description;

  const date = params.get("date") ?? "";
  if (dateStringSchema.safeParse(date).success && !Number.isNaN(new Date(date).getTime())) {
    prefill.date = transactionDateInputValue({ date: new Date(date).toISOString() });
  }

  return prefill;
}
