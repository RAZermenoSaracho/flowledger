import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AddRecordButton } from "../../components/AddRecordButton";
import { Button } from "../../components/Button";
import { useCurrenciesQuery } from "../../components/CurrencySelect";
import { ListView } from "../../components/ListView";
import { groupByFields } from "../../utils/groupByFields";
import { SearchBar, type SearchBarQuery } from "../../components/SearchBar";
import { ImportedTransactionsTab } from "./components/ImportedTransactionsTab";
import { TransactionRow } from "./components/TransactionRow";
import { useImportedTransactionsWorkflow } from "./hooks/useImportedTransactionsWorkflow";
import {
  buildTransactionSearchFields,
  TRANSACTION_DEFAULT_SEARCH_FIELD,
  TRANSACTION_GROUPABLE_FIELDS,
  TRANSACTION_SORTABLE_FIELDS
} from "./utils/transactionSearchFields";
import { usePagination } from "../../hooks/usePagination";
import { routes } from "../../constants/routes";
import { listAccounts } from "../../services/accounts.client";
import * as categoriesClient from "../../services/categories.client";
import { listGroups } from "../../services/groups.client";
import * as transactionsClient from "../../services/transactions.client";
import type { Transaction } from "../../types/transactions.types";
import { transactionDateInputValue } from "../../utils/dateTime";
import type { TransactionsTab } from "./types/transactions.types";

const TRANSACTIONS_DEFAULT_LIMIT = 50;

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
    const month = transactionDateInputValue(transaction).slice(0, 7);
    return { key: month, label: month };
  }
  return { key: "", label: "" };
}

function isTransactionsTab(value: string | null): value is TransactionsTab {
  return value === "transactions" || value === "imported";
}

/** Transactions list page with a personal-transactions tab and an imported-transactions review tab. */
export function TransactionsPage() {
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
    if (
      status === "pending" ||
      status === "processed" ||
      status === "ignored"
    ) {
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
    () =>
      [
        ...(currenciesQuery.data?.fiat ?? []),
        ...(currenciesQuery.data?.crypto ?? [])
      ].map((currency) => currency.code),
    [currenciesQuery.data]
  );

  // Memoized: an inline `data ?? []` fallback produces a fresh array
  // reference on every render whenever `data` is undefined, which would
  // invalidate `transactionSearchFields` below every render, which in
  // turn feeds SearchBar's `fields` prop — SearchBar re-fires its own
  // onQueryChange effect whenever `fields` changes identity, causing an
  // unbounded render loop (see ImportedTransactionsFiltersCard.tsx for
  // the same hazard called out explicitly).
  const allTransactionCategories = useMemo(
    () => allCategoriesQuery.data ?? [],
    [allCategoriesQuery.data]
  );
  const importedFilterAccounts = useMemo(
    () => accountsQuery.data ?? [],
    [accountsQuery.data]
  );
  const importedFilterCategories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data]
  );
  const [transactionQuery, setTransactionQuery] = useState<SearchBarQuery>({});

  const transactions = usePagination({
    queryKey: ["transactions", transactionQuery.where, transactionQuery.sort],
    resetKey: JSON.stringify({
      where: transactionQuery.where,
      sort: transactionQuery.sort
    }),
    defaultLimit: TRANSACTIONS_DEFAULT_LIMIT,
    storageKey: "transactions",
    fetchPage: async (pagination) => {
      const { data, meta } = await transactionsClient.listTransactions({
        where: transactionQuery.where,
        sort: transactionQuery.sort,
        pagination
      });
      return { items: data, total: meta.total, hasNext: meta.hasNext };
    }
  });

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
    [
      accountsQuery.data,
      allTransactionCategories,
      groupsQuery.data,
      currencyCodes
    ]
  );

  const groupedTransactions = useMemo(
    () =>
      groupByFields(transactions.items, transactionQuery.groupBy, transactionGroupKey),
    [transactions.items, transactionQuery.groupBy]
  );
  const pendingImportedCount = imported.pendingCount;

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
        <ListView<Transaction>
          title="Transactions"
          actions={
            <AddRecordButton
              label="transaction"
              onClick={() => navigate(routes.newTransaction)}
            />
          }
          toolbar={
            <SearchBar
              fields={transactionSearchFields}
              groupableFields={TRANSACTION_GROUPABLE_FIELDS}
              sortableFields={TRANSACTION_SORTABLE_FIELDS}
              defaultSearchField={TRANSACTION_DEFAULT_SEARCH_FIELD}
              initialSort={{ field: "date", direction: "desc" }}
              placeholder="Search transactions"
              onQueryChange={setTransactionQuery}
            />
          }
          items={
            groupedTransactions ? undefined : transactions.items
          }
          groups={groupedTransactions}
          rowKey={(transaction) => transaction.id}
          isLoading={transactions.isLoading}
          error={transactions.error}
          emptyText="No transactions found."
          pager={transactions.pager}
          renderItem={(transaction) => (
            <TransactionRow
              transaction={transaction}
              isDeleting={deleteTransaction.isPending}
              onEdit={(row) => navigate(routes.transaction(row.id))}
              onDelete={(row) => void confirmDeleteTransaction(row)}
            />
          )}
        />
      ) : (
        <ImportedTransactionsTab
          imported={imported}
          categories={importedFilterCategories}
          accounts={importedFilterAccounts}
          initialStatus={
            importedStatusParam === "pending" ||
            importedStatusParam === "processed" ||
            importedStatusParam === "ignored"
              ? importedStatusParam
              : null
          }
          searchBarResetKey={importedSearchBarResetKey}
          onShowPending={() => {
            const params = new URLSearchParams(searchParams);
            params.set("tab", "imported");
            params.set("status", "pending");
            setSearchParams(params, { replace: true });
          }}
        />
      )}
    </div>
  );
}
