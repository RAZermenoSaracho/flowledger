import type { DataSieveQuery } from "datasieve";
import type { RawWhereNode } from "../../../db/sieve.types.js";

/** Minimal account shape embedded in a {@link TransactionRecord}. */
type TransactionAccountRef = {
  id: string;
  name: string;
  type: string;
  currency: string;
};

/** Minimal category shape embedded in a {@link TransactionRecord}. */
type TransactionCategoryRef = {
  id: string;
  name: string;
  type: string;
};

/** Minimal group shape embedded in a {@link TransactionRecord}. */
type TransactionGroupRef = {
  id: string;
  name: string;
};

/**
 * Plain domain shape for `Transaction`, written for datasieve's generic
 * inference (`DataSieveQuery<TransactionRecord>`) — this is what
 * `read.service.ts` builds `where`/`sort`/`include` against so that no
 * Prisma type needs to be imported by anything above the service layer.
 * Relation refs are kept minimal (just enough for the fields the
 * frontend renders); the runtime shape always matches because every
 * query that includes a relation includes it in full via
 * `include: { <relation>: true }`, never a scoped subset.
 */
export interface TransactionRecord {
  id: string;
  userId: string;
  name: string;
  amount: number;
  executionCurrency: string;
  exchangeRate: number;
  amountInPreferredCurrency: number;
  type: "income" | "expense" | "transfer";
  date: Date;
  categoryId: string | null;
  expenseOffsetCategoryId: string | null;
  groupId: string | null;
  accountId: string | null;
  transferToAccountId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  account: TransactionAccountRef | null;
  transferToAccount: TransactionAccountRef | null;
  category: TransactionCategoryRef | null;
  expenseOffsetCategory: TransactionCategoryRef | null;
  group: TransactionGroupRef | null;
}

/**
 * Untrusted shape of the decoded `query` request param for
 * `GET /transactions` and `GET /transactions/summary`.
 *
 * `where` is a {@link RawWhereNode}, not a real `WhereInput<TransactionRecord>`:
 * it may contain leaf conditions on two virtual field names
 * ("classification", "transactionFilterType") that aren't real
 * `Transaction` columns. `read.service.ts`'s `expandVirtualConditions`
 * rewrites those in place into real conditions (preserving their exact
 * position in the AND/OR tree) before anything reaches datasieve; every
 * other leaf condition passes through untouched and is validated by
 * datasieve's own parse/validate pipeline. There is no separate `search`
 * field — the frontend's `<SearchBar>` folds free-text search into
 * `where` as an ordinary condition (see apps/web's `searchDomain.ts`).
 */
export type TransactionsQueryInput = {
  where?: RawWhereNode;
  sort?: DataSieveQuery<TransactionRecord>["sort"];
  pagination?: DataSieveQuery<TransactionRecord>["pagination"];
};

/** Review status of a provider-imported transaction awaiting confirmation. */
export type ImportedTransactionStatus = "pending" | "processed" | "ignored";

/** Filter/sort params accepted by the imported-transactions list and review endpoints. */
export type ImportedTransactionFilters = {
  status?: ImportedTransactionStatus;
  search?: string;
  provider?: string;
  accountId?: string;
  providerAccountId?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  amountFrom?: number;
  amountTo?: number;
  sortBy?: "transactionDate" | "amount" | "description" | "provider" | "status";
  sortDirection?: "asc" | "desc";
};

/**
 * Which imported transactions a batch action (import/ignore/unignore)
 * applies to: an explicit id list, or "everything matching the given
 * filters" (re-evaluated server-side at execution time, not a snapshot
 * of ids taken when the filter was displayed).
 */
export type ImportedTransactionSelection =
  | { mode: "ids"; ids: string[] }
  | { mode: "filtered"; filters?: ImportedTransactionFilters };
