import type { SortDirection, WhereNode } from "../utils/searchDomain";
import { ApiError, apiRequest } from "./api.client";
import type {
  DataSieveMeta,
  ProviderImportedTransaction,
  Transaction,
  TransactionsSummary
} from "../types/transactions.types";

/** Extracts per-item failures from a batch imported-transaction action's (batch-import/batch-ignore/batch-unignore) error body, without callers needing to know about `ApiError`. */
export function getBatchErrors(
  error: unknown
): { id: string; message: string }[] {
  if (!(error instanceof ApiError)) return [];
  const body = error.body as { errors?: { id: string; message: string }[] };
  return Array.isArray(body?.errors) ? body.errors : [];
}

export type { SortDirection };

/**
 * The wire shape `/transactions` and `/transactions/summary` accept, sent
 * as one JSON-encoded query-string parameter — see apps/api's transactions
 * `read.service.ts` for why (DSQL's and/or/not trees + typed values don't
 * round-trip reliably through bracket-notation query strings). Free-text
 * search is folded into `where` as a real (OR name/notes ilike ...)
 * condition by `<SearchBar>` rather than sent as a separate field — see
 * `src/utils/searchDomain.ts`. `where` can also include leaf conditions on
 * two virtual field names ("classification", "transactionFilterType")
 * that aren't real `Transaction` columns — `read.service.ts` recognizes
 * and expands them wherever they appear in the tree.
 */
export type TransactionsQuery = {
  where?: WhereNode;
  sort?: { field: string; direction: SortDirection }[];
  pagination?: { kind: "offset"; page: number; pageSize: number };
};

/** Fetches transactions for a DSQL query. */
export function listTransactions(query: TransactionsQuery = {}) {
  return apiRequest<{ data: Transaction[]; meta: DataSieveMeta }>(
    "/transactions",
    { query: { query: JSON.stringify(query) } }
  );
}

/** Fetches income/expense/balance summary totals for a DSQL query. */
export function getTransactionsSummary(
  query: Omit<TransactionsQuery, "sort"> = {}
) {
  return apiRequest<TransactionsSummary>("/transactions/summary", {
    query: { query: JSON.stringify(query) }
  });
}

/** Fetches one transaction by id. */
export function getTransaction(transactionId: string) {
  return apiRequest<{ transaction: Transaction }>(
    `/transactions/${transactionId}`
  );
}

/** Creates a transaction. */
export function createTransaction(body: Record<string, unknown>) {
  return apiRequest<{ transaction: Transaction }>("/transactions", {
    method: "POST",
    body
  });
}

/** Updates a transaction. */
export function updateTransaction(
  transactionId: string,
  body: Record<string, unknown>
) {
  return apiRequest<{ transaction: Transaction }>(
    `/transactions/${transactionId}`,
    { method: "PUT", body }
  );
}

/** Deletes a transaction. */
export function deleteTransaction(transactionId: string) {
  return apiRequest<void>(`/transactions/${transactionId}`, {
    method: "DELETE"
  });
}

/**
 * The wire shape `/transactions/imported` accepts, sent as one JSON-encoded
 * query-string parameter — same convention as `TransactionsQuery` (see its
 * comment above). `where` may include a leaf condition on one virtual field
 * name ("search", free text) that isn't a real column — apps/api's
 * read.service.ts expands it wherever it appears in the tree.
 */
export type ImportedTransactionsQuery = {
  where?: WhereNode;
  sort?: { field: string; direction: SortDirection }[];
};

/** Explicit id list or saved-filter selection for batch imported-transaction actions. */
export type ImportedTransactionSelection =
  | { mode: "ids"; ids: string[] }
  | { mode: "filtered"; where?: WhereNode };

/** Fetches imported transactions for a DSQL query. */
export function listImportedTransactions(
  query: ImportedTransactionsQuery = {}
) {
  return apiRequest<{
    importedTransactions: ProviderImportedTransaction[];
    total: number;
    pendingCount: number;
  }>("/transactions/imported", {
    query: { query: JSON.stringify(query) }
  });
}

/** Fetches the pending imported-transaction count. */
export function getImportedTransactionsPendingCount() {
  return apiRequest<{ count: number }>("/transactions/imported/pending-count");
}

/** Updates the category on a pending imported transaction. */
export function updateImportedTransactionCategory(
  importedTransactionId: string,
  categoryId: string | null
) {
  return apiRequest<{ importedTransaction: ProviderImportedTransaction }>(
    `/transactions/imported/${importedTransactionId}`,
    { method: "PATCH", body: { categoryId } }
  );
}

/** Imports one imported transaction into the ledger as a real `Transaction`. */
export function importImportedTransaction(
  importedTransactionId: string,
  categoryId?: string
) {
  return apiRequest<{ importedTransaction: ProviderImportedTransaction }>(
    `/transactions/imported/${importedTransactionId}/import`,
    { method: "POST", body: { categoryId } }
  );
}

/** Marks an imported transaction ignored. */
export function ignoreImportedTransaction(importedTransactionId: string) {
  return apiRequest<{ importedTransaction: ProviderImportedTransaction }>(
    `/transactions/imported/${importedTransactionId}/ignore`,
    { method: "POST" }
  );
}

/** Reverts an ignored imported transaction back to pending. */
export function unignoreImportedTransaction(importedTransactionId: string) {
  return apiRequest<{ importedTransaction: ProviderImportedTransaction }>(
    `/transactions/imported/${importedTransactionId}/unignore`,
    { method: "POST" }
  );
}

/** Imports a selection or batch of imported transactions into the ledger. */
export function batchImportImportedTransactions(
  selection: ImportedTransactionSelection,
  categoryId?: string
) {
  return apiRequest<{
    importedTransactions: ProviderImportedTransaction[];
    importedCount: number;
    errors: { id: string; message: string }[];
  }>("/transactions/imported/batch-import", {
    method: "POST",
    body: { selection, categoryId }
  });
}

/** Ignores a selection or batch of imported transactions. */
export function batchIgnoreImportedTransactions(
  selection: ImportedTransactionSelection
) {
  return apiRequest<{ ignoredCount: number; errors: unknown[] }>(
    "/transactions/imported/batch-ignore",
    { method: "POST", body: { selection } }
  );
}

/** Un-ignores a selection or batch of imported transactions. */
export function batchUnignoreImportedTransactions(
  selection: ImportedTransactionSelection
) {
  return apiRequest<{ unignoredCount: number; errors: unknown[] }>(
    "/transactions/imported/batch-unignore",
    { method: "POST", body: { selection } }
  );
}
