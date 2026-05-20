import type {
  ACCOUNT_TYPES,
  CATEGORY_TYPES,
  PARTICIPANT_STATUSES,
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

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type SummaryReport = {
  totalIncome: number;
  totalExpenses: number;
  currentBalance: number;
};
