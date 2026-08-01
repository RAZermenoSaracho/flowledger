export type SettlementDraft = {
  amount: string;
  accountId: string;
  categoryId: string;
  note: string;
  paymentInfo: string;
};

export type SettlementApprovalDraft = {
  accountId: string;
  categoryId: string;
  expenseOffsetCategoryId: string;
};

export type DebtsTab = "balances" | "pending" | "settled" | "sharedExpenses";
