import type {
  AccountType,
  CategoryType,
  ParticipantStatus,
  SettlementStatus,
  SharedExpenseStatus,
  TransactionType
} from "@flowledger/shared";

export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = Pick<User, "id" | "name" | "email">;

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

export type SettlementRequest = {
  id: string;
  sharedExpenseParticipantId: string;
  debtorUserId: string;
  creditorUserId: string;
  amount: number;
  status: SettlementStatus;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  debtor?: PublicUser;
  creditor?: PublicUser;
  sharedExpenseParticipant?: Debt;
};

export type Debt = SharedExpenseParticipant & {
  sharedExpenseId: string;
  debtorUserId?: string;
  creditorUserId?: string;
  outstandingAmount: number;
  pendingSettlementAmount: number;
  sharedExpense: SharedExpense & {
    owner?: PublicUser;
  };
  user?: PublicUser | null;
  settlementRequests: SettlementRequest[];
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
  categoryType: CategoryType | null;
  categoryColor?: string | null;
  type: TransactionType;
  total: number;
};

export type CashflowRow = {
  month: string;
  income: number;
  expenses: number;
  balance: number;
};
