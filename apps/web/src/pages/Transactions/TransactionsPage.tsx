import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AddRecordButton } from "../../components/AddRecordButton";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useCurrenciesQuery } from "../../components/CurrencySelect";
import { PageHeader } from "../../components/PageHeader";
import { groupByFields } from "../../components/SearchComponent";
import { SearchBar, type SearchBarQuery } from "../../components/SearchBar";
import { providerAccountLabel } from "./components/ImportedTransactionCard";
import { ImportedTransactionsFiltersCard } from "./components/ImportedTransactionsFiltersCard";
import { ImportedTransactionsPanel } from "./components/ImportedTransactionsPanel";
import { TransactionFormCard } from "./components/TransactionFormCard";
import { TransactionList } from "./components/TransactionList";
import { useImportedTransactionsWorkflow } from "./hooks/useImportedTransactionsWorkflow";
import {
  buildTransactionSearchFields,
  TRANSACTION_DEFAULT_SEARCH_FIELD,
  TRANSACTION_GROUPABLE_FIELDS,
  TRANSACTION_SORTABLE_FIELDS
} from "./utils/transactionSearchFields";
import { useAuth } from "../../hooks/useAuth";
import { listAccounts } from "../../services/accounts.client";
import * as categoriesClient from "../../services/categories.client";
import { listGroups } from "../../services/groups.client";
import * as transactionsClient from "../../services/transactions.client";
import type { Transaction } from "../../types/transactions.types";
import type { TransactionsTab } from "./types/transactions.types";

// groupByFields (components/SearchComponent.tsx) keys its group defs by
// `id`; SearchBar's GroupableField uses `name` (matching the rest of the
// generic field-config convention) — trivial adapter between the two.
const transactionGroupByDefsForBucketing = TRANSACTION_GROUPABLE_FIELDS.map((field) => ({
  id: field.name,
  label: field.label
}));

function isTransactionsTab(value: string | null): value is TransactionsTab {
  return value === "transactions" || value === "imported";
}

/** Transactions list page with a personal-transactions tab and an imported-transactions review tab. */
export function TransactionsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // The URL's `tab` param is the single source of truth for which tab is
  // active (mirrors DebtsPage's `activeTab`) — deriving it fresh every
  // render, rather than mirroring it into separate useState, means there's
  // no stale-state case where the URL says one tab but the rendered
  // content still shows another (e.g. navigating away from `?tab=imported`
  // via a plain link that omits the param entirely).
  const requestedTab = searchParams.get("tab");
  const activeTab: TransactionsTab = isTransactionsTab(requestedTab)
    ? requestedTab
    : "transactions";
  const [isTransactionFormOpen, setIsTransactionFormOpen] = useState(false);
  const imported = useImportedTransactionsWorkflow({ searchParams });
  // Bumped to force the imported tab's <SearchBar> to remount (re-reading
  // its `initialDomain` fresh) when the URL's `status` param changes while
  // already on that tab — e.g. the "Show pending" banner button below, or
  // an external link like the notification bell's — since switching *into*
  // the tab already remounts it naturally (conditionally rendered) and
  // picks up a fresh `status` on its own.
  const [importedSearchBarResetKey, setImportedSearchBarResetKey] = useState(0);
  const importedStatusParam = searchParams.get("status");

  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "pending" || status === "processed" || status === "ignored") {
      setImportedSearchBarResetKey((key) => key + 1);
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
  const currenciesQuery = useCurrenciesQuery();
  const currencyCodes = useMemo(
    () => [
      ...(currenciesQuery.data?.fiat ?? []),
      ...(currenciesQuery.data?.crypto ?? [])
    ].map((currency) => currency.code),
    [currenciesQuery.data]
  );

  const allTransactionCategories = allCategoriesQuery.data ?? [];
  const [transactionQuery, setTransactionQuery] = useState<SearchBarQuery>({});

  const transactionsQuery = useQuery({
    queryKey: ["transactions", transactionQuery],
    queryFn: async () =>
      transactionsClient.listTransactions({
        where: transactionQuery.where,
        sort: transactionQuery.sort
      })
  });

  const visibleTransactions = transactionsQuery.data?.data ?? [];
  // Sourced from the full currency list (independent of the current
  // transaction filter/results), not from `visibleTransactions` — every
  // condition's value picker must offer every possible value for a
  // field, regardless of what other conditions already narrow the
  // result set to. Deriving this from filtered results would make
  // currencies excluded by an existing condition disappear from the
  // picker, making it impossible to ever build e.g. an OR across two
  // currencies.
  const transactionSearchFields = useMemo(
    () =>
      buildTransactionSearchFields({
        accounts: accountsQuery.data ?? [],
        categories: allTransactionCategories,
        groups: groupsQuery.data ?? [],
        currencyOptions: currencyCodes
      }),
    [accountsQuery.data, allTransactionCategories, groupsQuery.data, currencyCodes]
  );

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

  const activeTransactionGroupBys = transactionQuery.groupBy ?? [];
  const groupedTransactions = useMemo(
    () =>
      groupByFields(
        visibleTransactions,
        activeTransactionGroupBys,
        transactionGroupByDefsForBucketing,
        transactionGroupKey
      ),
    [visibleTransactions, activeTransactionGroupBys]
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
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab === "imported" ? "imported" : "transactions");
    if (tab !== "imported") params.delete("status");
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="grid gap-6">
      {/* Desktop-only: on mobile, switching between Transactions and
          Imported Transactions happens exclusively through the sidebar
          drawer's dropdown (mirrors Debts' in-page tab bar, also
          `hidden ... lg:grid`) — no redundant control competing with it. */}
      <div className="hidden gap-2 lg:flex lg:flex-wrap">
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
            isOpen={isTransactionFormOpen}
            onClose={() => setIsTransactionFormOpen(false)}
            accounts={accountsQuery.data ?? []}
            groups={groupsQuery.data ?? []}
            personalCategories={categoriesQuery.data ?? []}
            defaultCurrency={auth.user?.preferredCurrency || "USD"}
            onCreated={async () => {}}
          />
          <div className="grid gap-4">
            <Card>
              <PageHeader
                title="Transactions"
                action={
                  <AddRecordButton
                    label="transaction"
                    onClick={() => setIsTransactionFormOpen(true)}
                  />
                }
              >
                <SearchBar
                  fields={transactionSearchFields}
                  groupableFields={TRANSACTION_GROUPABLE_FIELDS}
                  sortableFields={TRANSACTION_SORTABLE_FIELDS}
                  defaultSearchField={TRANSACTION_DEFAULT_SEARCH_FIELD}
                  initialSort={{ field: "date", direction: "desc" }}
                  placeholder="Search transactions"
                  onQueryChange={setTransactionQuery}
                />
              </PageHeader>
            </Card>
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
                  onClick={() => {
                    const params = new URLSearchParams(searchParams);
                    params.set("tab", "imported");
                    params.set("status", "pending");
                    setSearchParams(params, { replace: true });
                  }}
                >
                  Show pending
                </Button>
              </div>
            </Card>
          ) : null}

          <ImportedTransactionsFiltersCard
            resetKey={importedSearchBarResetKey}
            initialStatus={
              importedStatusParam === "pending" ||
              importedStatusParam === "processed" ||
              importedStatusParam === "ignored"
                ? importedStatusParam
                : null
            }
            onQueryChange={imported.updateImportedQuery}
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
            isPendingFilter={imported.isPendingFilter}
            isIgnoredFilter={imported.isIgnoredFilter}
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
