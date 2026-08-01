import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { providerAccountLabel } from "./components/ImportedTransactionCard";
import { ImportedTransactionsFiltersCard } from "./components/ImportedTransactionsFiltersCard";
import { ImportedTransactionsPanel } from "./components/ImportedTransactionsPanel";
import {
  TransactionFiltersCard,
  emptyTransactionFilters,
  groupByFields,
  transactionGroupByDefs
} from "./components/TransactionFiltersCard";
import { TransactionFormCard } from "./components/TransactionFormCard";
import { TransactionList } from "./components/TransactionList";
import { TransactionSummaryCards } from "./components/TransactionSummaryCards";
import { useImportedTransactionsWorkflow } from "./hooks/useImportedTransactionsWorkflow";
import { useAuth } from "../../hooks/useAuth";
import { listAccounts } from "../../services/accounts.client";
import * as categoriesClient from "../../services/categories.client";
import { listGroups } from "../../services/groups.client";
import * as transactionsClient from "../../services/transactions.client";
import type { TransactionSortBy } from "../../services/transactions.client";
import type { Transaction } from "../../types/transactions.types";
import type { TransactionsTab } from "./types/transactions.types";

export function TransactionsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(emptyTransactionFilters);
  const [typeFilterValues, setTypeFilterValues] = useState<string[]>([]);
  const [accountFilterValues, setAccountFilterValues] = useState<string[]>([]);
  const [categoryFilterValues, setCategoryFilterValues] = useState<string[]>(
    []
  );
  const [groupFilterValues, setGroupFilterValues] = useState<string[]>([]);
  const [currencyFilterValues, setCurrencyFilterValues] = useState<string[]>(
    []
  );
  const [transactionGroupBys, setTransactionGroupBys] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TransactionsTab>(
    searchParams.get("tab") === "imported" ? "imported" : "transactions"
  );
  const [sortBy, setSortBy] = useState<TransactionSortBy>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const imported = useImportedTransactionsWorkflow({
    activeTab,
    searchParams,
    setSearchParams
  });

  useEffect(() => {
    const tab = searchParams.get("tab");
    const status = searchParams.get("status");

    if (tab === "imported") setActiveTab("imported");
    if (
      status === "pending" ||
      status === "processed" ||
      status === "ignored"
    ) {
      imported.setImportedFilters((current) => ({ ...current, status }));
    }
  }, [searchParams]);

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => (await listAccounts()).accounts
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await categoriesClient.listCategories()).categories
  });
  const allCategoriesQuery = useQuery({
    queryKey: ["categories", "all"],
    queryFn: async () =>
      (await categoriesClient.listCategories({ scope: "all" })).categories
  });
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: async () => (await listGroups()).groups
  });
  const transactionQueryFilters: transactionsClient.ListTransactionsParams = {
    search: filters.search || undefined,
    transactionFilterType:
      (filters.transactionFilterType as
        | "normal"
        | "settlement"
        | "expenseOffset"
        | "") || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    amountFrom: filters.amountFrom ? Number(filters.amountFrom) : undefined,
    amountTo: filters.amountTo ? Number(filters.amountTo) : undefined,
    classification:
      (filters.classification as "complete" | "needsClassification" | "") ||
      undefined,
    types: typeFilterValues as ("income" | "expense" | "transfer")[],
    accountIds: accountFilterValues,
    categoryIds: categoryFilterValues,
    groupIds: groupFilterValues,
    executionCurrencies: currencyFilterValues,
    sortBy,
    sortDirection
  };
  const transactionsQuery = useQuery({
    queryKey: ["transactions", transactionQueryFilters],
    queryFn: async () =>
      transactionsClient.listTransactions(transactionQueryFilters)
  });

  const allTransactionCategories = allCategoriesQuery.data ?? [];
  const transactionCurrencyOptions = useMemo(() => {
    const currencies = new Set<string>();
    for (const transaction of transactionsQuery.data?.transactions ?? []) {
      currencies.add(transaction.executionCurrency);
    }
    return [...currencies].sort();
  }, [transactionsQuery.data]);
  const visibleTransactions = transactionsQuery.data?.transactions ?? [];

  function transactionGroupKey(transaction: Transaction, groupById: string) {
    if (groupById === "category") {
      return {
        key: transaction.categoryId ?? "uncategorized",
        label: transaction.category?.name ?? "Uncategorized"
      };
    }
    if (groupById === "account") {
      return {
        key: transaction.accountId ?? "no-account",
        label: transaction.account?.name ?? "No account"
      };
    }
    if (groupById === "month") {
      const month = transaction.date.slice(0, 7);
      return { key: month, label: month };
    }
    return { key: "", label: "" };
  }

  const groupedTransactions = useMemo(
    () =>
      groupByFields(
        visibleTransactions,
        transactionGroupBys,
        transactionGroupByDefs,
        transactionGroupKey
      ),
    [visibleTransactions, transactionGroupBys]
  );
  const pendingImportedCount =
    imported.importedTransactionsQuery.data?.pendingCount ?? 0;
  const importedAccountOptions = useMemo(() => {
    const seen = new Set<string>();

    return imported.importedTransactions.flatMap((transaction) => {
      const id =
        transaction.providerAccount?.id ?? transaction.providerAccountId;
      if (!id || seen.has(id)) return [];

      seen.add(id);
      return [
        {
          id,
          label: [
            providerAccountLabel(transaction) || transaction.providerAccountId,
            transaction.providerAccount?.account?.name
              ? `Linked to ${transaction.providerAccount.account.name}`
              : null
          ]
            .filter(Boolean)
            .join(" · ")
        }
      ];
    });
  }, [imported.importedTransactions]);
  const transactionSummary = transactionsQuery.data?.summary ?? {
    income: 0,
    expenses: 0,
    balance: 0
  };
  const summaryCurrency = auth.user?.preferredCurrency || "USD";
  const hasActiveFilters =
    Object.values(filters).some(Boolean) ||
    typeFilterValues.length > 0 ||
    accountFilterValues.length > 0 ||
    categoryFilterValues.length > 0 ||
    groupFilterValues.length > 0 ||
    currencyFilterValues.length > 0;

  const deleteTransaction = useMutation({
    mutationFn: (transactionId: string) =>
      transactionsClient.deleteTransaction(transactionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      await queryClient.invalidateQueries({ queryKey: ["shared-expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  async function confirmDeleteTransaction(transaction: Transaction) {
    const confirmed = window.confirm(
      `Delete "${transaction.name}" permanently? This will also remove any attached shared transaction, participants, debts, settlements, and related notifications.`
    );
    if (!confirmed) return;

    await deleteTransaction.mutateAsync(transaction.id);
  }

  function switchTab(tab: TransactionsTab) {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab === "imported" ? "imported" : "transactions");
    if (tab === "imported" && imported.importedFilters.status) {
      params.set("status", imported.importedFilters.status);
    } else {
      params.delete("status");
    }
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["transactions", "Transactions"],
            ["imported", "Imported Transactions"]
          ] as const
        ).map(([tab, label]) => (
          <Button
            key={tab}
            type="button"
            variant={activeTab === tab ? "primary" : "secondary"}
            onClick={() => switchTab(tab)}
          >
            {label}
            {tab === "imported" && pendingImportedCount > 0
              ? ` (${pendingImportedCount} pending)`
              : ""}
          </Button>
        ))}
      </div>

      {activeTab === "transactions" ? (
        <>
          <TransactionFormCard
            accounts={accountsQuery.data ?? []}
            groups={groupsQuery.data ?? []}
            personalCategories={categoriesQuery.data ?? []}
            defaultCurrency={auth.user?.preferredCurrency || "USD"}
            onCreated={async () => {
              // no-op: mutation inside the form already invalidates queries
            }}
          />
          <div className="grid gap-4">
            <TransactionFiltersCard
              filters={filters}
              onFiltersChange={setFilters}
              typeFilterValues={typeFilterValues}
              onTypeFilterValuesChange={setTypeFilterValues}
              accountFilterValues={accountFilterValues}
              onAccountFilterValuesChange={setAccountFilterValues}
              categoryFilterValues={categoryFilterValues}
              onCategoryFilterValuesChange={setCategoryFilterValues}
              groupFilterValues={groupFilterValues}
              onGroupFilterValuesChange={setGroupFilterValues}
              currencyFilterValues={currencyFilterValues}
              onCurrencyFilterValuesChange={setCurrencyFilterValues}
              groupBys={transactionGroupBys}
              onGroupBysChange={setTransactionGroupBys}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onSortByChange={setSortBy}
              onSortDirectionChange={setSortDirection}
              onClearFilters={() => {
                setFilters(emptyTransactionFilters);
                setTypeFilterValues([]);
                setAccountFilterValues([]);
                setCategoryFilterValues([]);
                setGroupFilterValues([]);
                setCurrencyFilterValues([]);
              }}
              accounts={accountsQuery.data ?? []}
              categories={allTransactionCategories}
              groups={groupsQuery.data ?? []}
              currencyOptions={transactionCurrencyOptions}
            />
            <TransactionSummaryCards
              income={transactionSummary.income}
              expenses={transactionSummary.expenses}
              balance={transactionSummary.balance}
              currency={summaryCurrency}
              hasActiveFilters={hasActiveFilters}
              transactionCount={visibleTransactions.length}
            />
            <TransactionList
              groupedTransactions={groupedTransactions}
              totalCount={visibleTransactions.length}
              isDeleting={deleteTransaction.isPending}
              onEdit={(transaction) =>
                navigate(`/transactions/${transaction.id}/edit`)
              }
              onDelete={(transaction) =>
                void confirmDeleteTransaction(transaction)
              }
            />
          </div>
        </>
      ) : (
        <div className="grid gap-4">
          {pendingImportedCount > 0 ? (
            <Card>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <p className="font-semibold text-amber-900 dark:text-amber-100">
                  You have {pendingImportedCount} imported transaction
                  {pendingImportedCount === 1 ? "" : "s"} pending review.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() =>
                    imported.updateImportedFilter({
                      ...imported.importedFilters,
                      status: "pending"
                    })
                  }
                >
                  Show pending
                </Button>
              </div>
            </Card>
          ) : null}

          <ImportedTransactionsFiltersCard
            filters={imported.importedFilters}
            onFiltersChange={imported.updateImportedFilter}
            sortBy={imported.importedSortBy}
            sortDirection={imported.importedSortDirection}
            onSortByChange={imported.setImportedSortBy}
            onSortDirectionChange={imported.setImportedSortDirection}
            accounts={accountsQuery.data ?? []}
            categories={categoriesQuery.data ?? []}
            providerAccountOptions={importedAccountOptions}
          />

          <ImportedTransactionsPanel
            totalCount={imported.importedTransactionsQuery.data?.total ?? 0}
            importedTransactions={imported.importedTransactions}
            categories={categoriesQuery.data ?? []}
            selectedImportedIds={imported.selectedImportedIds}
            selectAllFilteredImported={imported.selectAllFilteredImported}
            batchCategoryId={imported.batchCategoryId}
            isPendingFilter={imported.importedFilters.status === "pending"}
            isIgnoredFilter={imported.importedFilters.status === "ignored"}
            isBatchImporting={
              imported.batchImportImportedTransactions.isPending
            }
            isBatchIgnoring={imported.batchIgnoreImportedTransactions.isPending}
            isBatchUnignoring={
              imported.batchUnignoreImportedTransactions.isPending
            }
            isImporting={imported.importImportedTransaction.isPending}
            isIgnoring={imported.ignoreImportedTransaction.isPending}
            isUnignoring={imported.unignoreImportedTransaction.isPending}
            isLoading={imported.importedTransactionsQuery.isLoading}
            batchError={
              imported.batchImportImportedTransactions.error ??
              imported.batchIgnoreImportedTransactions.error ??
              imported.batchUnignoreImportedTransactions.error
            }
            onBatchCategoryChange={imported.setBatchCategoryId}
            onVisibleSelectionChange={imported.setAllVisibleImportedSelected}
            onAllFilteredSelectionChange={(selected) => {
              imported.setSelectAllFilteredImported(selected);
              if (selected) imported.setSelectedImportedIds([]);
            }}
            onImportSelected={() =>
              imported.batchImportImportedTransactions.mutate()
            }
            onIgnoreSelected={() =>
              imported.batchIgnoreImportedTransactions.mutate()
            }
            onUnignoreSelected={() =>
              imported.batchUnignoreImportedTransactions.mutate()
            }
            onToggleSelection={imported.toggleImportedSelection}
            onCategoryChange={(id, categoryId) =>
              imported.updateImportedCategory.mutate({ id, categoryId })
            }
            onImport={(transaction) =>
              void imported.importOneImportedTransaction(transaction)
            }
            onIgnore={(id) => imported.ignoreImportedTransaction.mutate(id)}
            onUnignore={(id) => imported.unignoreImportedTransaction.mutate(id)}
          />
        </div>
      )}
    </div>
  );
}
