import type {
  ACCOUNT_TYPES,
  HOLDING_KINDS,
  HOLDING_MISSING_REASONS,
  HOLDING_VALUATION_SOURCES,
  CATEGORY_TYPES,
  CREDIT_CARD_KINDS,
  PAYMENT_DUE_RULES,
  MOBILE_SIDEBAR_SIDES,
  PARTICIPANT_STATUSES,
  NOTIFICATION_TYPES,
  PLAN_TYPES,
  SETTLEMENT_STATUSES,
  SHARED_EXPENSE_STATUSES,
  TRANSACTION_TYPES
} from "../constants/index.js";

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type PaymentDueRule = (typeof PAYMENT_DUE_RULES)[number];
export type CreditCardKind = (typeof CREDIT_CARD_KINDS)[number];
export type CategoryType = (typeof CATEGORY_TYPES)[number];
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type HoldingKind = (typeof HOLDING_KINDS)[number];
export type HoldingValuationSource = (typeof HOLDING_VALUATION_SOURCES)[number];
export type HoldingMissingReason = (typeof HOLDING_MISSING_REASONS)[number];
export type SharedExpenseStatus = (typeof SHARED_EXPENSE_STATUSES)[number];
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type PlanType = (typeof PLAN_TYPES)[number];
export type MobileSidebarSide = (typeof MOBILE_SIDEBAR_SIDES)[number];
/** A group member's role — `admin` can manage members/categories/settings, `member` cannot. */
export type GroupRole = "admin" | "member";
/** Broad classification of a provider institution/connector, used for filtering the connection picker UI. */
export type InstitutionCategory =
  | "bank"
  | "broker"
  | "exchange"
  | "wallet"
  | "government"
  | "other";

/** How any user is shown to another user: never email, phone or auth data. `displayName` is the user's name only when their visibility is `username_and_name`, else `null`. */
export type PublicUser = {
  id: string;
  username: string;
  nickname: string | null;
  displayName: string | null;
};

/** Aggregate income/expense/balance totals for a reporting period, distinguishing gross amounts from amounts net of expense reimbursements/offsets. */
export type SummaryReport = {
  totalIncome: number;
  totalGrossIncome: number;
  totalNetIncome: number;
  totalExpenses: number;
  totalGrossExpenses: number;
  totalExpenseReimbursements: number;
  totalNetExpenses: number;
  currentBalance: number;
};

/** One bank/institution a provider can connect to, as returned by the provider's institution catalog. */
export type ProviderInstitution = {
  provider: string;
  institutionId: string;
  name: string;
  logoUrl: string | null;
  country: string | null;
  category: InstitutionCategory;
  supportedAccountTypes: string[];
  rawData: Record<string, unknown>;
};

/** One connector option a provider offers for starting a new connection flow (may or may not map 1:1 to a `ProviderInstitution`). */
export type ProviderConnector = {
  provider: string;
  connectorId: string;
  title: string;
  description: string;
  helperText?: string;
  country: string | null;
  category: InstitutionCategory;
  coverageLabel: string;
};

/** Everything the frontend needs to render/continue a provider's connection flow — a redirect URL, an embedded widget, or both, depending on the provider. */
export type ProviderConnectionFlow = {
  provider: string;
  connectorId?: string;
  institutionId?: string;
  institutionName: string;
  flowId?: string;
  token?: string;
  url?: string;
  widget?: {
    token: string;
    config: Record<string, unknown>;
    scriptUrl?: string;
    styleUrl?: string;
  };
};

/** Lifecycle of one credit-card billing period. */
export type BillingPeriodStatus =
  | "open"
  | "pending"
  | "partially_paid"
  | "paid"
  | "paid_late"
  | "overdue";

/** Credits applied to a period, by source; decimal strings in the card currency. */
export interface CreditBreakdown {
  transfers: string;
  payments: string;
  refunds: string;
  cashback: string;
  other: string;
}

/** Live balance and limit usage of a card; decimal strings in the card currency. */
export interface CreditCardMetrics {
  currency: string;
  balance: string;
  debt: string;
  creditBalance: string;
  creditLimit: string | null;
  availableCredit: string | null;
  utilizationPercent: string | null;
  overLimit: boolean;
}

/** Interest projection for a period: `none` when nothing accrues, `unavailable` when inputs are missing. */
export interface InterestEstimate {
  status: "none" | "unavailable" | "estimated";
  amount: string | null;
  projected: boolean;
  avoidAmount: string | null;
  assumptions: string[];
}

/** One closed or open billing period. Dates are local `YYYY-MM-DD` in the card's billing time zone; `closingDebt` is null while open. */
export interface BillingPeriod {
  start: string;
  end: string;
  /** Period start instant (inclusive), UTC ISO, computed in the card's billing time zone. */
  startAt: string;
  /** Closing boundary instant (exclusive), UTC ISO: the start of the day after `end` in the billing time zone. */
  endAt: string;
  dueDate: string;
  status: BillingPeriodStatus;
  closingDebt: string | null;
  credits: string;
  creditsBreakdown: CreditBreakdown;
  remaining: string | null;
  onTimeRemaining: string | null;
  confirmedInterest: string;
  estimate: InterestEstimate;
}

/** The stored billing configuration of a credit card, as returned by the API. */
export interface CreditCardBillingConfig {
  creditLimit: string | null;
  statementClosingDay: number;
  paymentDueRule: PaymentDueRule;
  paymentDueValue: number;
  billingTimeZone: string;
  annualInterestRate: string | null;
}

/** Response of `GET /accounts/:id/credit-card`; `periods` is one page, newest first. `config`/`openPeriod`/`current` are null when the card has no billing cycle configured. */
export interface CreditCardBilling {
  accountId: string;
  configured: boolean;
  config: CreditCardBillingConfig | null;
  metrics: CreditCardMetrics;
  openPeriod: { start: string; nextClosingDate: string; nextDueDate: string } | null;
  current: {
    closingDate: string;
    dueDate: string;
    remaining: string;
    status: BillingPeriodStatus;
    daysUntilDue: number;
    estimate: InterestEstimate;
  } | null;
  periods: BillingPeriod[];
  page: number;
  pageSize: number;
  totalPeriods: number;
}

/** Credits that reduced credit-card debt in the report range, split informationally. Decimal strings in the preferred currency. */
export interface CreditCardCredits {
  total: string;
  transfers: string;
  payments: string;
  refunds: string;
  cashback: string;
  other: string;
}

/** An existing transaction that may duplicate a pending imported row. */
export interface PossibleDuplicate {
  id: string;
  name: string;
  date: string;
  amount: string;
}

/**
 * A holding's resolved valuation. Known valuations have a decimal-string `value` in the account currency and a null
 * `missingReason`; missing ones have `value: null` and a reason, never `"0"`. `unitPrice`/`priceCurrency` keep the
 * original quotation or manual entry currency. `valuedAt` is the last successful update (null for `cash` and missing).
 */
export interface HoldingValuation {
  source: HoldingValuationSource | null;
  unitPrice: string | null;
  priceCurrency: string | null;
  valuedAt: string | null;
  value: string | null;
  missingReason: HoldingMissingReason | null;
}

/**
 * A stored holding with its valuation. `quantity` and `manualUnitPrice` are exact decimal strings. `code` is null only for
 * `other` holdings, which are identified by `name`; `unit` is an optional descriptive unit of an `other` quantity (e.g. "m²").
 */
export interface Holding {
  id: string;
  accountId: string;
  kind: HoldingKind;
  code: string | null;
  name: string | null;
  unit: string | null;
  quantity: string;
  manualUnitPrice: string | null;
  manualPriceCurrency: string | null;
  manualPricedAt: string | null;
  valuation: HoldingValuation;
}

/**
 * Value of an investment or crypto account, in the account currency: the sum of its holdings and the account's only value
 * (the transaction-derived balance never counts). `value` is the known subtotal (missing holdings excluded, rounded once);
 * `status` is `partial` when any holding is missing and `empty` (value zero) when the account has no holdings.
 */
export interface HoldingsValuation {
  currency: string;
  value: string;
  status: "complete" | "partial" | "empty";
  missingCount: number;
  holdingCount: number;
}

/**
 * Money transferred into and out of an investment or crypto account, in the account currency, from its transfer
 * transactions only (income, expenses and the initial balance are excluded, as are transfers from the account to itself).
 * `incoming` sums the recorded `destinationAmount` of transfers into the account and `outgoing` the recorded `accountAmount`
 * of transfers out, at the amounts stored when each transfer was made (no revaluation at current rates). `net` is
 * `incoming − outgoing`. `excludedCount` counts transfers with no recorded amount for this account, which are left out.
 * Informational only: never part of the account's value or net worth.
 */
export interface AccountContributions {
  currency: string;
  incoming: string;
  outgoing: string;
  net: string;
  transferCount: number;
  excludedCount: number;
}

/** Response of `GET`/`PATCH /accounts/:id/holdings`. */
export interface AccountHoldings {
  accountId: string;
  holdings: Holding[];
  valuation: HoldingsValuation;
}
