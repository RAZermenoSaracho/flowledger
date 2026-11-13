import type { SharedExpenseStatus } from "@flowledger/shared";

/** Editable fields of the Shared Expense Form View; participants are managed on the transaction's Sharing tab. */
export type SharedExpenseDraft = {
  title: string;
  status: SharedExpenseStatus;
};
