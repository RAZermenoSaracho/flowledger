export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;
export const CATEGORY_TYPES = ["income", "expense"] as const;
export const SHARED_EXPENSE_STATUSES = ["open", "settled", "cancelled"] as const;
export const PARTICIPANT_STATUSES = ["pending", "partial", "paid"] as const;
export const SETTLEMENT_STATUSES = ["pending", "approved", "rejected"] as const;
export const PLAN_TYPES = ["free", "flowledger_one"] as const;

export const ACCOUNT_TYPES = [
  "cash",
  "checking",
  "savings",
  "credit_card",
  "investment",
  "other"
] as const;
