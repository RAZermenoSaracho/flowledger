import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import * as transactionsClient from "../../../services/transactions.client";
import type { ListImportedTransactionsParams } from "../../../services/transactions.client";
import type { ProviderImportedTransaction } from "../../../types/transactions.types";
import { emptyImportedFilters } from "../components/ImportedTransactionsFiltersCard";
import type {
  ImportedFilters,
  ImportedSortBy
} from "../types/transactions.types";

export function useImportedTransactionsWorkflow({
  activeTab,
  searchParams,
  setSearchParams
}: {
  activeTab: "transactions" | "imported";
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
}) {
  const queryClient = useQueryClient();
  const [importedFilters, setImportedFilters] = useState<ImportedFilters>({
    ...emptyImportedFilters,
    status:
      searchParams.get("status") === "processed" ||
      searchParams.get("status") === "ignored" ||
      searchParams.get("status") === "pending"
        ? searchParams.get("status")!
        : emptyImportedFilters.status
  });
  const [importedSortBy, setImportedSortBy] =
    useState<ImportedSortBy>("transactionDate");
  const [importedSortDirection, setImportedSortDirection] = useState<
    "asc" | "desc"
  >("desc");
  const [selectedImportedIds, setSelectedImportedIds] = useState<string[]>([]);
  const [selectAllFilteredImported, setSelectAllFilteredImported] =
    useState(false);
  const [batchCategoryId, setBatchCategoryId] = useState("");

  const importedQueryFilters: ListImportedTransactionsParams = {
    status:
      (importedFilters.status as "pending" | "processed" | "ignored" | "") ||
      undefined,
    search: importedFilters.search || undefined,
    provider: importedFilters.provider || undefined,
    accountId: importedFilters.accountId || undefined,
    providerAccountId: importedFilters.providerAccountId || undefined,
    categoryId: importedFilters.categoryId || undefined,
    dateFrom: importedFilters.dateFrom || undefined,
    dateTo: importedFilters.dateTo || undefined,
    amountFrom: importedFilters.amountFrom
      ? Number(importedFilters.amountFrom)
      : undefined,
    amountTo: importedFilters.amountTo
      ? Number(importedFilters.amountTo)
      : undefined,
    sortBy: importedSortBy,
    sortDirection: importedSortDirection
  };
  const importedTransactionsQuery = useQuery({
    queryKey: ["transactions", "imported", importedQueryFilters],
    queryFn: async () =>
      transactionsClient.listImportedTransactions(importedQueryFilters)
  });
  const importedTransactions =
    importedTransactionsQuery.data?.importedTransactions ?? [];
  const importedSelection = selectAllFilteredImported
    ? { mode: "filtered" as const, filters: importedQueryFilters }
    : { mode: "ids" as const, ids: selectedImportedIds };

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

  function updateImportedFilter(nextFilters: ImportedFilters) {
    setImportedFilters(nextFilters);
    setSelectedImportedIds([]);
    setSelectAllFilteredImported(false);

    if (activeTab === "imported") {
      const params = new URLSearchParams(searchParams);
      params.set("tab", "imported");
      if (nextFilters.status) params.set("status", nextFilters.status);
      else params.delete("status");
      setSearchParams(params, { replace: true });
    }
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
    importedFilters,
    setImportedFilters,
    updateImportedFilter,
    importedSortBy,
    setImportedSortBy,
    importedSortDirection,
    setImportedSortDirection,
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
