import type { TransactionType } from "@flowledger/shared";
import type { Account } from "./accounts.types";
import type { Category } from "./categories.types";
import type { Group } from "./groups.types";
import type { SharedExpense } from "./sharedExpenses.types";

/** Transaction record shape as returned by the API. */
export type Transaction = {
  id: string;
  name: string;
  amount: number;
  executionCurrency: string;
  exchangeRate: number;
  amountInPreferredCurrency: number;
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

/** Review status of a provider-imported transaction. */
export type ProviderImportedTransactionStatus =
  | "pending"
  | "processed"
  | "ignored";

/** Provider-imported transaction record shape, staged for review before becoming a `Transaction`. */
export type ProviderImportedTransaction = {
  id: string;
  provider: string;
  providerAccountId: string;
  providerTransactionId: string;
  description: string;
  amount: number;
  currency: string;
  transactionDate: string;
  refreshDate?: string | null;
  status: ProviderImportedTransactionStatus;
  categoryId?: string | null;
  transactionId?: string | null;
  createdAt: string;
  updatedAt: string;
  category?: Category | null;
  transaction?: Transaction | null;
  providerAccount?: {
    id: string;
    provider: string;
    providerAccountId: string;
    accountId?: string | null;
    accountMetadata?: Record<string, unknown> | null;
    account?: Account | null;
    connection?: {
      id: string;
      institutionId?: string | null;
      institutionName?: string | null;
      status: string;
      lastSyncAt?: string | null;
    } | null;
  } | null;
};

/** Income/expenses/balance summary shape. */
export type TransactionsSummary = {
  income: number;
  expenses: number;
  balance: number;
};

/** Pagination/total metadata returned alongside a DSQL query result. */
export type DataSieveMeta = {
  // total/page/pageSize/pageCount are all null when a query omits both
  // an explicit `pagination` and the engine has no defaultPageSize
  // configured (datasieve@^0.2.0) — the query then runs fully
  // unpaginated, which is what /transactions does by default today.
  total: number | null;
  page: number | null;
  pageSize: number | null;
  pageCount: number | null;
  hasNext: boolean;
  hasPrevious: boolean;
  executionTime: number;
};
