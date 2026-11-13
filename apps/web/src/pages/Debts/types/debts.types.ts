/** In-progress settlement request form state. */
export type SettlementDraft = {
  amount: string;
  /** Amount in the account's currency; empty unless the account's currency differs from the debt's. */
  accountAmount: string;
  accountId: string;
  categoryId: string;
  note: string;
  paymentInfo: string;
};

/** In-progress settlement approval form state. */
export type SettlementApprovalDraft = {
  /** Amount in the deposit account's currency; empty unless it differs from the debt's currency. */
  accountAmount: string;
  accountId: string;
  categoryId: string;
  expenseOffsetCategoryId: string;
};

/** Which tab of the debts page is active. */
export type DebtsTab = "balances" | "pending" | "settled" | "sharedExpenses" | "awaiting";
