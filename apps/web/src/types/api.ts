import type {
  AccountType,
  CategoryType,
  HouseholdRole,
  ParticipantStatus,
  PlanType,
  SettlementStatus,
  SharedExpenseStatus,
  TransactionType
} from "@flowledger/shared";

export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  planType: PlanType;
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
  householdId?: string | null;
  name: string;
  type: CategoryType;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HouseholdMember = {
  id: string;
  householdId: string;
  userId: string;
  role: HouseholdRole;
  user: PublicUser;
  createdAt: string;
  updatedAt: string;
};

export type HouseholdCategory = Category & { householdId: string };

export type Household = {
  id: string;
  name: string;
  description?: string | null;
  ownerUserId: string;
  members: HouseholdMember[];
  categories: HouseholdCategory[];
  transactions?: Transaction[];
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
  householdId?: string | null;
  householdCategoryId?: string | null;
  accountId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  account?: Account | null;
  category?: Category | null;
  household?: Household | null;
  householdCategory?: HouseholdCategory | null;
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
  debtorUserId?: string | null;
  creditorUserId?: string | null;
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
