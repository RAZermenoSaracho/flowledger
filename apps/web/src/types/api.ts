import type { AccountType, CategoryType, ParticipantStatus, SharedExpenseStatus, TransactionType } from "@flowledger/shared";

export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  identifier?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Transaction = {
  id: string;
  name: string;
  amount: number;
  type: TransactionType;
  date: string;
  categoryId?: string | null;
  accountId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  account?: Account | null;
  category?: Category | null;
  sharedExpense?: SharedExpense | null;
};

export type SharedExpenseParticipant = {
  id: string;
  userId?: string | null;
  participantName: string;
  shareAmount: number;
  paidAmount: number;
  status: ParticipantStatus;
};

export type SharedExpense = {
  id: string;
  transactionId: string;
  ownerUserId: string;
  title: string;
  totalAmount: number;
  status: SharedExpenseStatus;
  transaction?: Transaction;
  participants: SharedExpenseParticipant[];
  createdAt: string;
  updatedAt: string;
};

export type Summary = {
  totalIncome: number;
  totalExpenses: number;
  currentBalance: number;
};

export type CategoryReportRow = {
  categoryId: string | null;
  categoryName: string;
  type: TransactionType;
  total: number;
};

export type CashflowRow = {
  month: string;
  income: number;
  expenses: number;
  balance: number;
};
