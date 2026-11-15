import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AddRecordButton } from "../../components/AddRecordButton";
import { Tabs } from "../../components/Tabs";
import { ListView } from "../../components/ListView";
import { groupByFields } from "../../utils/groupByFields";
import { SearchBar, type SearchBarQuery } from "../../components/SearchBar";
import { ImportedTransactionsTab } from "./components/ImportedTransactionsTab";
import { TransactionRow } from "./components/TransactionRow";
import { useImportedTransactionsWorkflow } from "./hooks/useImportedTransactionsWorkflow";
import { useTransactionSearchFields } from "./hooks/useTransactionSearchFields";
import { transactionGroupKey } from "./utils/transactions";
import {
  TRANSACTION_DEFAULT_SEARCH_FIELD,
  TRANSACTION_GROUPABLE_FIELDS,
  TRANSACTION_SORTABLE_FIELDS
} from "./utils/transactionSearchFields";
import { usePagination } from "../../hooks/usePagination";
import { routes } from "../../constants/routes";
import { listAccounts } from "../../services/accounts.client";
import * as categoriesClient from "../../services/categories.client";
import * as transactionsClient from "../../services/transactions.client";
import type { Transaction } from "../../types/transactions.types";
import type { TransactionsTab } from "./types/transactions.types";

const TRANSACTIONS_DEFAULT_LIMIT = 50;

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
  // Memoized: an inline `data ?? []` fallback is a fresh array every render, and the imported tab's SearchBar
  // re-fires `onQueryChange` whenever its `fields` change identity (see ImportedTransactionsFiltersCard.tsx).
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

  const transactionSearchFields = useTransactionSearchFields();

  const groupedTransactions = useMemo(
    () =>
      groupByFields(
        transactions.items,
        transactionQuery.groupBy,
        transactionGroupKey
      ),
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
      <Tabs
        label="Transaction views"
        variant="buttons"
        desktopOnly
        idPrefix="transactions-"
        activeId={activeTab}
        onSelect={(id) => switchTab(id as TransactionsTab)}
        tabs={[
          {
            id: "transactions",
            label: "Transactions",
            content: (
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
                items={groupedTransactions ? undefined : transactions.items}
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
            )
          },
          {
            id: "imported",
            label:
              pendingImportedCount > 0
                ? `Imported Transactions (${pendingImportedCount} pending)`
                : "Imported Transactions",
            content: (
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
            )
          }
        ]}
      />
    </div>
  );
}
