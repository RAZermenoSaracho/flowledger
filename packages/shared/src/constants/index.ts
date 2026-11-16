/** Mirrors the Prisma `PaymentDueRule` enum. */
export const PAYMENT_DUE_RULES = [
  "day_of_next_month",
  "days_after_closing"
] as const;
/**
 * Largest `days_after_closing` value: a due date must not fall after the next statement closing (each payment
 * window belongs to exactly one period), and the shortest cycle (February, or day 31 clamped to Feb 28) is 28 days.
 */
export const MAX_DAYS_AFTER_CLOSING = 28;
/** Mirrors the Prisma `CreditCardKind` enum. */
export const CREDIT_CARD_KINDS = [
  "payment",
  "refund",
  "cashback",
  "interest"
] as const;
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
  "shared_expense_rejected",
  "credit_card_period_closed",
  "credit_card_payment_due_soon",
  "credit_card_period_partially_paid",
  "credit_card_period_paid",
  "credit_card_payment_overdue"
] as const;
export const IDENTITY_VISIBILITIES = [
  "username_only",
  "username_and_name"
] as const;
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
  "crypto",
  "other"
] as const;

/** Holding instrument kinds: `fiat` is uninvested cash (an ISO 4217 code), `crypto` a crypto asset code. */
export const HOLDING_KINDS = ["crypto", "fiat"] as const;

/** Account types that may hold holdings; their value is the sum of their holdings once they have any. */
export const HOLDING_ACCOUNT_TYPES = ["investment", "crypto"] as const;

/** Where a holding's valuation came from: `cash` (fiat at par), `manual` (user override), or `market` (provider quotation). */
export const HOLDING_VALUATION_SOURCES = ["cash", "manual", "market"] as const;

/** Why a holding has no value: the provider doesn't quote the code, no price data is available, or the conversion into the account currency failed. */
export const HOLDING_MISSING_REASONS = ["unsupported", "price_unavailable", "rate_unavailable"] as const;
