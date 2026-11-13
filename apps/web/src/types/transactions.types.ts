import type { PublicUser } from "./users.types";
import type { TransactionType } from "@flowledger/shared";
import type { Account } from "./accounts.types";
import type { Category } from "./categories.types";
import type { Group } from "./groups.types";
import type { SharedExpense } from "./sharedExpenses.types";

/** Transaction record shape as returned by the API. */
export type Transaction = {
  id: string;
  name: string;
  amount: string;
  /** Amount in the account's currency; equals `amount` when the currencies match. */
  accountAmount?: string | null;
  /** Received amount in the destination account's currency (transfers only). */
  destinationAmount?: string | null;
  feeAmount?: string | null;
  /** Execution or destination currency of the recorded fee. */
  feeCurrency?: string | null;
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
  /** Set when imported from a provider; `transactionDate` is the provider's original value. */
  providerImportedTransaction?: { transactionDate: string } | null;
  /** The viewer-owned original expense when this transaction is a settlement. */
  relatedTransactions?: RelatedTransaction[];
  /** Every settlement request of an original expense's participants, oldest first. */
  relatedSettlements?: RelatedSettlement[];
  /** For a participant's settlement: summary of the shared expense it settles; not navigable. */
  settlementOrigin?: SettlementOrigin | null;
};

/** The viewer-owned original expense of the viewed settlement. */
export type RelatedTransaction = {
  id: string;
  description: string;
  amount: string;
  currency: string;
  date: string;
  type: string;
  relation: "origin";
};

/** A settlement request on the viewed original expense; `transaction` is only the viewer's own settlement transaction, null while unapproved. */
export type RelatedSettlement = {
  id: string;
  status: string;
  amount: string;
  currency: string;
  createdAt: string;
  approvedAt: string | null;
  counterparty: PublicUser;
  participantId: string;
  transaction: { id: string; description: string; date: string; type: string } | null;
};

/** What a participant may see of the shared expense behind their settlement. */
export type SettlementOrigin = {
  title: string;
  amount: string;
  currency: string;
  date: string;
  type: string;
  owner: PublicUser;
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
  amount: string;
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

/** Record a related transactions list is scoped to. */
export type RelatedTransactionsScope = { field: "accountId" | "groupId"; value: string };
