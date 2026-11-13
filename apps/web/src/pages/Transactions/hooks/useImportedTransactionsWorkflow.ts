import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useListSelection } from "../../../hooks/useListSelection";
import { usePagination } from "../../../hooks/usePagination";
import type { SearchBarQuery } from "../../../components/SearchBar";
import * as transactionsClient from "../../../services/transactions.client";
import type { ImportedTransactionSelection } from "../../../services/transactions.client";
import type { ProviderImportedTransaction } from "../../../types/transactions.types";

/** Default window size of the imported-transactions list. */
const IMPORTED_TRANSACTIONS_DEFAULT_LIMIT = 50;

/**
 * State and handlers for the imported-transactions tab: filters, the paged window, `useListSelection`
 * selection (which can span windows via "all matching") and batch actions. Every mutation that
 * succeeds clears the selection.
 */
export function useImportedTransactionsWorkflow({
  searchParams
}: {
  searchParams: URLSearchParams;
}) {
  const queryClient = useQueryClient();
  const initialStatus =
    searchParams.get("status") === "processed" ||
    searchParams.get("status") === "ignored" ||
    searchParams.get("status") === "pending"
      ? searchParams.get("status")
      : null;
  const [importedQuery, setImportedQuery] = useState<SearchBarQuery>(() =>
    initialStatus
      ? { where: { field: "status", op: "=", value: initialStatus } }
      : {}
  );
  const [batchCategoryId, setBatchCategoryId] = useState("");

  const resetKey = JSON.stringify({
    where: importedQuery.where,
    sort: importedQuery.sort
  });
  const paging = usePagination<
    ProviderImportedTransaction,
    {
      items: ProviderImportedTransaction[];
      total: number;
      pendingCount: number;
    }
  >({
    queryKey: [
      "transactions",
      "imported",
      importedQuery.where,
      importedQuery.sort
    ],
    resetKey,
    defaultLimit: IMPORTED_TRANSACTIONS_DEFAULT_LIMIT,
    storageKey: "imported-transactions",
    fetchPage: async (pagination) => {
      const { importedTransactions, total, pendingCount } =
        await transactionsClient.listImportedTransactions({
          where: importedQuery.where,
          sort: importedQuery.sort,
          pagination
        });
      return { items: importedTransactions, total, pendingCount };
    }
  });
  const importedTransactions = paging.items;
  const selection = useListSelection({
    resetKey,
    windowKey: `${paging.pager.offset}:${paging.pager.limit}`,
    total: paging.pager.total ?? undefined,
    canSelectAllMatching: true
  });
  const request = selection.toRequest();
  const importedSelection: ImportedTransactionSelection =
    request.mode === "all"
      ? { mode: "filtered", where: importedQuery.where }
      : { mode: "ids", ids: request.ids };

  // Import/Ignore only make sense while every currently-visible row is
  // pending; Unignore only while every visible row is ignored. Derived
  // from the actual fetched rows (not from inspecting the `where` tree,
  // which — now that filtering is a general FilterBuilder condition, not a
  // single-select facet — can't reliably answer "is the user viewing only
  // pending rows" on its own).
  const isPendingFilter =
    importedTransactions.length > 0 &&
    importedTransactions.every(
      (transaction) => transaction.status === "pending"
    );
  const isIgnoredFilter =
    importedTransactions.length > 0 &&
    importedTransactions.every(
      (transaction) => transaction.status === "ignored"
    );

  async function invalidateImportedWorkflow() {
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["summary"] });
    await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    await queryClient.invalidateQueries({
      queryKey: ["notifications", "unread-count"]
    });
    await queryClient.invalidateQueries({
      queryKey: ["provider-imported-transactions", "pending-count"]
    });
  }

  const updateImportedCategory = useMutation({
    mutationFn: (input: { id: string; categoryId: string | null }) =>
      transactionsClient.updateImportedTransactionCategory(
        input.id,
        input.categoryId
      ),
    onSuccess: invalidateImportedWorkflow
  });

  const importImportedTransaction = useMutation({
    mutationFn: (input: { id: string; categoryId: string }) =>
      transactionsClient.importImportedTransaction(input.id, input.categoryId),
    onSuccess: async () => {
      selection.clear();
      await invalidateImportedWorkflow();
    }
  });

  const ignoreImportedTransaction = useMutation({
    mutationFn: (id: string) =>
      transactionsClient.ignoreImportedTransaction(id),
    onSuccess: async () => {
      selection.clear();
      await invalidateImportedWorkflow();
    }
  });

  const batchImportImportedTransactions = useMutation({
    mutationFn: () =>
      transactionsClient.batchImportImportedTransactions(
        importedSelection,
        batchCategoryId || undefined
      ),
    onSuccess: async () => {
      selection.clear();
      setBatchCategoryId("");
      await invalidateImportedWorkflow();
    }
  });

  const batchIgnoreImportedTransactions = useMutation({
    mutationFn: () =>
      transactionsClient.batchIgnoreImportedTransactions(importedSelection),
    onSuccess: async () => {
      selection.clear();
      await invalidateImportedWorkflow();
    }
  });

  const unignoreImportedTransaction = useMutation({
    mutationFn: (id: string) =>
      transactionsClient.unignoreImportedTransaction(id),
    onSuccess: async () => {
      selection.clear();
      await invalidateImportedWorkflow();
    }
  });

  const batchUnignoreImportedTransactions = useMutation({
    mutationFn: () =>
      transactionsClient.batchUnignoreImportedTransactions(importedSelection),
    onSuccess: async () => {
      selection.clear();
      await invalidateImportedWorkflow();
    }
  });

  async function importOneImportedTransaction(
    transaction: ProviderImportedTransaction
  ) {
    const categoryId = transaction.categoryId;
    if (!categoryId) return;

    await importImportedTransaction.mutateAsync({
      id: transaction.id,
      categoryId
    });
  }

  return {
    importedQuery,
    pager: paging.pager,
    isLoading: paging.isLoading,
    error: paging.error,
    pendingCount: paging.data?.pendingCount ?? 0,
    selection,
    updateImportedQuery: setImportedQuery,
    isPendingFilter,
    isIgnoredFilter,
    batchCategoryId,
    setBatchCategoryId,
    importedTransactions,
    updateImportedCategory,
    importImportedTransaction,
    ignoreImportedTransaction,
    batchImportImportedTransactions,
    batchIgnoreImportedTransactions,
    unignoreImportedTransaction,
    batchUnignoreImportedTransactions,
    importOneImportedTransaction
  };
}
