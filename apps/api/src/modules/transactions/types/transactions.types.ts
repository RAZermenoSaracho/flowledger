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

/** Minimal category shape embedded in an {@link ImportedTransactionRecord}. */
type ImportedTransactionCategoryRef = {
  id: string;
  name: string;
};

/**
 * Minimal `providerAccount` shape embedded in an
 * {@link ImportedTransactionRecord} — just enough for the `accountId` dot-path
 * facet (`providerAccount.accountId`, "linked to this FlowLedger account")
 * that `read.service.ts`'s DSQL `where` filters through.
 */
type ImportedTransactionProviderAccountRef = {
  id: string;
  accountId: string | null;
};

/**
 * Plain domain shape for `ProviderImportedTransaction`, written for
 * datasieve's generic inference (`DataSieveQuery<ImportedTransactionRecord>`)
 * — this is what `read.service.ts` builds `where`/`sort` against. Unlike
 * {@link TransactionRecord}, the actual API response is NOT hydrated via a
 * DSQL `include` built from this shape: the full nested
 * `providerAccount.account`/`providerAccount.connection`/`category`/
 * `transaction` tree the frontend needs (see `importedTransactionInclude`
 * in `utils/importedTransactionQuery.ts`) is deep enough that hand-mirroring
 * it as a second DSQL-shaped include risks drifting from the one raw-Prisma
 * include already relied on by create/update services. Instead, datasieve
 * only resolves *which ids* match (`resolveImportedTransactionIds`), and a
 * follow-up raw-Prisma `findMany` with the proven `importedTransactionInclude`
 * hydrates those ids in order.
 */
export interface ImportedTransactionRecord {
  id: string;
  userId: string | null;
  connectionId: string | null;
  providerAccountRefId: string | null;
  transactionId: string | null;
  categoryId: string | null;
  provider: string;
  providerUserId: string | null;
  providerCredentialId: string;
  providerAccountId: string;
  providerTransactionId: string;
  description: string;
  amount: number;
  currency: string;
  transactionDate: Date;
  refreshDate: Date | null;
  status: ImportedTransactionStatus;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: ImportedTransactionCategoryRef | null;
  providerAccount: ImportedTransactionProviderAccountRef | null;
}

/**
 * Untrusted shape of the decoded `query` request param for `GET
 * /transactions/imported`. `where` is a {@link RawWhereNode}, not a real
 * `WhereInput<ImportedTransactionRecord>`: it may contain a leaf condition
 * on one virtual field name ("search") that isn't a real column —
 * `read.service.ts`'s `resolveImportedTransactionIds` rewrites it in place
 * into a real `id in [...]` condition (resolved via a narrow raw-Prisma
 * precompute over the fields the old free-text search spanned) before
 * anything reaches datasieve. Every other leaf condition passes through
 * untouched.
 */
export type ImportedTransactionsQueryInput = {
  where?: RawWhereNode;
  sort?: DataSieveQuery<ImportedTransactionRecord>["sort"];
};

/**
 * Which imported transactions a batch action (import/ignore/unignore)
 * applies to: an explicit id list, or "everything matching the given DSQL
 * `where` tree" (re-evaluated server-side at execution time via the same
 * `resolveImportedTransactionIds` the list endpoint uses, not a snapshot of
 * ids taken when the filter was displayed).
 */
export type ImportedTransactionSelection =
  | { mode: "ids"; ids: string[] }
  | { mode: "filtered"; where?: RawWhereNode };
