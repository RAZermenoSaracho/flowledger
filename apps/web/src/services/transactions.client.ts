import { ApiError, apiRequest } from "./api.client";
import type {
  ProviderImportedTransaction,
  ProviderImportedTransactionStatus,
  Transaction,
  TransactionsSummary
} from "../types/transactions.types";
import type { TransactionType } from "@flowledger/shared";

// Batch imported-transaction endpoints (batch-import/batch-ignore/batch-unignore)
// return per-item failures in the error body; this extracts them for display
// without callers needing to know about ApiError.
export function getBatchErrors(
  error: unknown
): { id: string; message: string }[] {
  if (!(error instanceof ApiError)) return [];
  const body = error.body as { errors?: { id: string; message: string }[] };
  return Array.isArray(body?.errors) ? body.errors : [];
}

export type TransactionSortBy = "date" | "createdAt" | "name" | "amount";
export type SortDirection = "asc" | "desc";

export type ListTransactionsParams = {
  dateFrom?: string;
  dateTo?: string;
  amountFrom?: number;
  amountTo?: number;
  categoryId?: string;
  categoryIds?: string[];
  groupId?: string;
  groupIds?: string[];
  accountId?: string;
  accountIds?: string[];
  executionCurrency?: string;
  executionCurrencies?: string[];
  type?: TransactionType;
  types?: TransactionType[];
  transactionFilterType?: "normal" | "settlement" | "expenseOffset";
  classification?: "complete" | "needsClassification";
  search?: string;
  sortBy?: TransactionSortBy;
  sortDirection?: SortDirection;
  limit?: number;
};

export function listTransactions(params: ListTransactionsParams = {}) {
  return apiRequest<{
    transactions: Transaction[];
    summary: TransactionsSummary;
  }>("/transactions", {
    query: {
      ...params,
      amountFrom: params.amountFrom?.toString(),
      amountTo: params.amountTo?.toString(),
      limit: params.limit?.toString()
    } as Record<string, string | string[] | undefined>
  });
}

export function getTransaction(transactionId: string) {
  return apiRequest<{ transaction: Transaction }>(
    `/transactions/${transactionId}`
  );
}

export function createTransaction(body: Record<string, unknown>) {
  return apiRequest<{ transaction: Transaction }>("/transactions", {
    method: "POST",
    body
  });
}

export function updateTransaction(
  transactionId: string,
  body: Record<string, unknown>
) {
  return apiRequest<{ transaction: Transaction }>(
    `/transactions/${transactionId}`,
    { method: "PUT", body }
  );
}

export function deleteTransaction(transactionId: string) {
  return apiRequest<void>(`/transactions/${transactionId}`, {
    method: "DELETE"
  });
}

export type ImportedTransactionSelection =
  | { mode: "ids"; ids: string[] }
  | { mode: "filtered"; filters?: ListImportedTransactionsParams };

export type ListImportedTransactionsParams = {
  status?: ProviderImportedTransactionStatus;
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
  sortDirection?: SortDirection;
};

export function listImportedTransactions(
  params: ListImportedTransactionsParams = {}
) {
  return apiRequest<{
    importedTransactions: ProviderImportedTransaction[];
    total: number;
    pendingCount: number;
  }>("/transactions/imported", {
    query: {
      ...params,
      amountFrom: params.amountFrom?.toString(),
      amountTo: params.amountTo?.toString()
    } as Record<string, string | undefined>
  });
}

export function getImportedTransactionsPendingCount() {
  return apiRequest<{ count: number }>("/transactions/imported/pending-count");
}

export function updateImportedTransactionCategory(
  importedTransactionId: string,
  categoryId: string | null
) {
  return apiRequest<{ importedTransaction: ProviderImportedTransaction }>(
    `/transactions/imported/${importedTransactionId}`,
    { method: "PATCH", body: { categoryId } }
  );
}

export function importImportedTransaction(
  importedTransactionId: string,
  categoryId?: string
) {
  return apiRequest<{ importedTransaction: ProviderImportedTransaction }>(
    `/transactions/imported/${importedTransactionId}/import`,
    { method: "POST", body: { categoryId } }
  );
}

export function ignoreImportedTransaction(importedTransactionId: string) {
  return apiRequest<{ importedTransaction: ProviderImportedTransaction }>(
    `/transactions/imported/${importedTransactionId}/ignore`,
    { method: "POST" }
  );
}

export function unignoreImportedTransaction(importedTransactionId: string) {
  return apiRequest<{ importedTransaction: ProviderImportedTransaction }>(
    `/transactions/imported/${importedTransactionId}/unignore`,
    { method: "POST" }
  );
}

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

export function batchIgnoreImportedTransactions(
  selection: ImportedTransactionSelection
) {
  return apiRequest<{ ignoredCount: number; errors: unknown[] }>(
    "/transactions/imported/batch-ignore",
    { method: "POST", body: { selection } }
  );
}

export function batchUnignoreImportedTransactions(
  selection: ImportedTransactionSelection
) {
  return apiRequest<{ unignoredCount: number; errors: unknown[] }>(
    "/transactions/imported/batch-unignore",
    { method: "POST", body: { selection } }
  );
}
