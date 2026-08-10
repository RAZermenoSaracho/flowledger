import type {
  ACCOUNT_TYPES,
  CATEGORY_TYPES,
  MOBILE_SIDEBAR_SIDES,
  PARTICIPANT_STATUSES,
  NOTIFICATION_TYPES,
  PLAN_TYPES,
  SETTLEMENT_STATUSES,
  SHARED_EXPENSE_STATUSES,
  TRANSACTION_TYPES
} from "../constants/index.js";

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type CategoryType = (typeof CATEGORY_TYPES)[number];
export type AccountType = (typeof ACCOUNT_TYPES)[number];
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

/** Non-sensitive user fields safe to expose to other users (e.g. group members, shared-expense participants) — never `passwordHash` or other secrets. */
export type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
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
