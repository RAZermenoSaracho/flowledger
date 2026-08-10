import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SearchBarQuery } from "../../../components/SearchBar";
import * as transactionsClient from "../../../services/transactions.client";
import type { ImportedTransactionSelection } from "../../../services/transactions.client";
import type { ProviderImportedTransaction } from "../../../types/transactions.types";

/** State and handlers for the imported-transactions tab: filters, selection, and batch actions. */
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
  const [selectedImportedIds, setSelectedImportedIds] = useState<string[]>([]);
  const [selectAllFilteredImported, setSelectAllFilteredImported] =
    useState(false);
  const [batchCategoryId, setBatchCategoryId] = useState("");

  const importedTransactionsQuery = useQuery({
    queryKey: ["transactions", "imported", importedQuery],
    queryFn: async () =>
      transactionsClient.listImportedTransactions({
        where: importedQuery.where,
        sort: importedQuery.sort
      })
  });
  const importedTransactions =
    importedTransactionsQuery.data?.importedTransactions ?? [];
  const importedSelection: ImportedTransactionSelection =
    selectAllFilteredImported
      ? { mode: "filtered", where: importedQuery.where }
      : { mode: "ids", ids: selectedImportedIds };

  // Import/Ignore only make sense while every currently-visible row is
  // pending; Unignore only while every visible row is ignored. Derived
  // from the actual fetched rows (not from inspecting the `where` tree,
  // which — now that filtering is a general FilterBuilder condition, not a
  // single-select facet — can't reliably answer "is the user viewing only
  // pending rows" on its own).
  const isPendingFilter =
    importedTransactions.length > 0 &&
    importedTransactions.every((transaction) => transaction.status === "pending");
  const isIgnoredFilter =
    importedTransactions.length > 0 &&
    importedTransactions.every((transaction) => transaction.status === "ignored");

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
      setSelectedImportedIds([]);
      setSelectAllFilteredImported(false);
      await invalidateImportedWorkflow();
    }
  });

  const ignoreImportedTransaction = useMutation({
    mutationFn: (id: string) =>
      transactionsClient.ignoreImportedTransaction(id),
    onSuccess: async () => {
      setSelectedImportedIds([]);
      setSelectAllFilteredImported(false);
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
      setSelectedImportedIds([]);
      setSelectAllFilteredImported(false);
      setBatchCategoryId("");
      await invalidateImportedWorkflow();
    }
  });

  const batchIgnoreImportedTransactions = useMutation({
    mutationFn: () =>
      transactionsClient.batchIgnoreImportedTransactions(importedSelection),
    onSuccess: async () => {
      setSelectedImportedIds([]);
      setSelectAllFilteredImported(false);
      await invalidateImportedWorkflow();
    }
  });

  const unignoreImportedTransaction = useMutation({
    mutationFn: (id: string) =>
      transactionsClient.unignoreImportedTransaction(id),
    onSuccess: async () => {
      setSelectedImportedIds([]);
      setSelectAllFilteredImported(false);
      await invalidateImportedWorkflow();
    }
  });

  const batchUnignoreImportedTransactions = useMutation({
    mutationFn: () =>
      transactionsClient.batchUnignoreImportedTransactions(importedSelection),
    onSuccess: async () => {
      setSelectedImportedIds([]);
      setSelectAllFilteredImported(false);
      await invalidateImportedWorkflow();
    }
  });

  function updateImportedQuery(nextQuery: SearchBarQuery) {
    setImportedQuery(nextQuery);
    setSelectedImportedIds([]);
    setSelectAllFilteredImported(false);
  }

  function toggleImportedSelection(id: string) {
    setSelectAllFilteredImported(false);
    setSelectedImportedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    );
  }

  function setAllVisibleImportedSelected(selected: boolean) {
    setSelectAllFilteredImported(false);
    setSelectedImportedIds(
      selected ? importedTransactions.map((row) => row.id) : []
    );
  }

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
    updateImportedQuery,
    isPendingFilter,
    isIgnoredFilter,
    selectedImportedIds,
    selectAllFilteredImported,
    setSelectAllFilteredImported,
    setSelectedImportedIds,
    batchCategoryId,
    setBatchCategoryId,
    importedTransactionsQuery,
    importedTransactions,
    updateImportedCategory,
    importImportedTransaction,
    ignoreImportedTransaction,
    batchImportImportedTransactions,
    batchIgnoreImportedTransactions,
    unignoreImportedTransaction,
    batchUnignoreImportedTransactions,
    toggleImportedSelection,
    setAllVisibleImportedSelected,
    importOneImportedTransaction
  };
}
