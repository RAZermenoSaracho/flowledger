import type {
  ACCOUNT_TYPES,
  CATEGORY_TYPES,
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
export type GroupRole = "admin" | "member";
export type InstitutionCategory =
  | "bank"
  | "broker"
  | "exchange"
  | "wallet"
  | "government"
  | "other";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

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
