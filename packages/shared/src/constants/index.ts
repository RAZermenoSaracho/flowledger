export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;
export const PROVIDER_IMPORTED_TRANSACTION_STATUSES = [
  "pending",
  "processed",
  "ignored"
] as const;
export const TRANSACTION_FILTER_TYPES = [
  "normal",
  "settlement",
  "expenseOffset"
] as const;
export const CATEGORY_TYPES = ["income", "expense"] as const;
export const SHARED_EXPENSE_STATUSES = [
  "open",
  "settled",
  "cancelled"
] as const;
export const PARTICIPANT_STATUSES = ["pending", "partial", "paid"] as const;
export const SETTLEMENT_STATUSES = ["pending", "approved", "rejected"] as const;
export const NOTIFICATION_TYPES = [
  "group_member_added",
  "shared_expense_added",
  "debt_owes_money",
  "debt_owed_money",
  "settlement_requested",
  "settlement_approved",
  "settlement_rejected",
  "settlement_payment_registration_needed",
  "provider_transactions_pending"
] as const;
export const PLAN_TYPES = ["free", "flowledger_one"] as const;
export const MOBILE_SIDEBAR_SIDES = ["left", "right"] as const;

export const ACCOUNT_TYPES = [
  "cash",
  "checking",
  "savings",
  "credit_card",
  "investment",
  "other"
] as const;
