import type { Transaction } from "../../../types/transactions.types";
import { transactionDateInputValue } from "../../../utils/dateTime";

/** Coerces a transaction amount value (number or numeric string) into a safe finite number, defaulting to 0. */
export function parseTransactionAmount(amount: unknown) {
  if (typeof amount === "number") {
    return Number.isFinite(amount) ? amount : 0;
  }

  if (typeof amount === "string") {
    const parsedAmount = Number(amount.trim());
    return Number.isFinite(parsedAmount) ? parsedAmount : 0;
  }

  return 0;
}

/** Group-by bucket (key + header label) of a transaction for the `category`, `account` and `month` group-bys. */
export function transactionGroupKey(
  transaction: Transaction,
  groupById: string
) {
  if (groupById === "category") {
    return {
      key: transaction.categoryId ?? "uncategorized",
      label: transaction.category?.name ?? "Uncategorized"
    };
  }
  if (groupById === "account") {
    return {
      key: transaction.accountId ?? "no-account",
      label: transaction.account?.name ?? "No account"
    };
  }
  if (groupById === "month") {
    const month = transactionDateInputValue(transaction).slice(0, 7);
    return { key: month, label: month };
  }
  return { key: "", label: "" };
}
