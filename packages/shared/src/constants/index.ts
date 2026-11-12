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
  "provider_transactions_pending",
  "shared_expense_invited",
  "shared_expense_updated",
  "shared_expense_accepted",
  "shared_expense_rejected"
] as const;
export const IDENTITY_VISIBILITIES = ["username_only", "username_and_name"] as const;
export const SHARE_ACCEPTANCES = ["proposed", "accepted", "rejected"] as const;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const RESERVED_USERNAMES = [
  "admin",
  "support",
  "flowledger",
  "api",
  "root",
  "me",
  "settings",
  "help",
  "system",
  "null",
  "undefined"
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
