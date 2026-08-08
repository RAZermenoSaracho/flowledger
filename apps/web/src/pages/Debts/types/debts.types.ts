/** In-progress settlement request form state. */
export type SettlementDraft = {
  amount: string;
  accountId: string;
  categoryId: string;
  note: string;
  paymentInfo: string;
};

/** In-progress settlement approval form state. */
export type SettlementApprovalDraft = {
  accountId: string;
  categoryId: string;
  expenseOffsetCategoryId: string;
};

/** Which tab of the debts page is active. */
export type DebtsTab = "balances" | "pending" | "settled" | "sharedExpenses";
