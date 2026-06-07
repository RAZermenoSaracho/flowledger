import type {
  AccountType,
  CategoryType,
  GroupRole,
  NotificationType,
  ParticipantStatus,
  PlanType,
  SettlementStatus,
  SharedExpenseStatus,
  TransactionType
} from "@flowledger/shared";
import type { ProviderInstitution } from "@flowledger/shared";

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
  initialBalance: number;
  currentBalance?: number;
  isArchived: boolean;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Institution = ProviderInstitution;

export type ProviderImportedAccount = {
  id: string;
  provider: string;
  institutionName?: string | null;
  name: string;
  type: AccountType;
  providerType?: string | null;
  currency?: string | null;
  balance?: number | null;
  status: string;
  linkedAccountId?: string | null;
  linkedAccount?: Pick<Account, "id" | "name" | "type"> | null;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  groupId?: string | null;
  name: string;
  type: CategoryType;
  color?: string | null;
  isArchived: boolean;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GroupMember = {
  id: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  user: PublicUser;
  createdAt: string;
  updatedAt: string;
};

export type Group = {
  id: string;
  name: string;
  description?: string | null;
  ownerUserId: string;
  isArchived: boolean;
  archivedAt?: string | null;
  members: GroupMember[];
  categories: Category[];
  transactions?: Transaction[];
  summary?: {
    totalIncome: number;
    totalExpenses: number;
    balance: number;
  };
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
  expenseOffsetCategoryId?: string | null;
  groupId?: string | null;
  accountId?: string | null;
  transferToAccountId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  account?: Account | null;
  transferToAccount?: Account | null;
  category?: Category | null;
  expenseOffsetCategory?: Category | null;
  group?: Group | null;
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
  paymentInfo?: string | null;
  debtorAccountId?: string | null;
  debtorCategoryId?: string | null;
  creditorAccountId?: string | null;
  creditorCategoryId?: string | null;
  debtorTransactionId?: string | null;
  creditorTransactionId?: string | null;
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

export type Notification = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  readAt?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type Summary = {
  totalIncome: number;
  totalGrossIncome: number;
  totalNetIncome: number;
  totalExpenses: number;
  totalGrossExpenses: number;
  totalExpenseReimbursements: number;
  totalNetExpenses: number;
  currentBalance: number;
};

export type CategoryReportRow = {
  categoryId: string | null;
  categoryName: string;
  categoryType: CategoryType | null;
  categoryColor?: string | null;
  type: TransactionType;
  total: number;
  grossIncomeTotal: number;
  incomeOffsetTotal: number;
  netIncomeTotal: number;
  grossExpenseTotal: number;
  reimbursementTotal: number;
  netExpenseTotal: number;
};

export type CashflowRow = {
  month: string;
  income: number;
  expenses: number;
  grossExpenses: number;
  expenseReimbursements: number;
  netExpenses: number;
  grossIncome: number;
  incomeOffsets: number;
  netIncome: number;
  balance: number;
};
