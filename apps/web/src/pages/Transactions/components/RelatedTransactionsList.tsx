import { Link } from "react-router-dom";
import { routes } from "../../../constants/routes";
import { useRelatedTransactions } from "../hooks/useRelatedTransactions";
import { useMemo } from "react";
import { useTransactionSearchFields } from "../hooks/useTransactionSearchFields";
import { transactionGroupKey } from "../utils/transactions";
import {
  TRANSACTION_DEFAULT_SEARCH_FIELD,
  TRANSACTION_GROUPABLE_FIELDS,
  TRANSACTION_SORTABLE_FIELDS
} from "../utils/transactionSearchFields";
import type {
  RelatedTransactionsScope,
  Transaction
} from "../../../types/transactions.types";
import type {
  DomainGroupNode,
  SearchFieldConfig
} from "../../../utils/searchDomain";
import { groupByFields } from "../../../utils/groupByFields";
import { formatMoney } from "../../../utils/currency";
import { formatTransactionDate } from "../../../utils/dateTime";
import { ListViewPagination } from "../../../components/ListView";
import { RelatedList } from "../../../components/RelatedList";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";

/**
 * "Transactions" tab body for an account or group Form View: the Transactions page's SearchBar (every transaction
 * field, operators, AND/OR groups, chips, group-by and sort) over the scope's transactions, newest first by default,
 * with the range pager in the header. The scope is enforced outside the editable domain (see `useRelatedTransactions`).
 * `extraFields` adds page-specific fields such as a billing period; `initialDomain` is read once on mount, so remount
 * with a new `key` to apply an external change. `onQueryChange` mirrors every SearchBar query to the caller.
 */
export function RelatedTransactionsList({
  scope,
  emptyText,
  extraFields,
  initialDomain,
  onQueryChange
}: {
  scope: RelatedTransactionsScope;
  emptyText: string;
  extraFields?: SearchFieldConfig[];
  initialDomain?: DomainGroupNode;
  onQueryChange?: (query: SearchBarQuery) => void;
}) {
  const list = useRelatedTransactions(scope);
  const transactionFields = useTransactionSearchFields();
  const fields = useMemo(
    () =>
      extraFields?.length
        ? [...extraFields, ...transactionFields]
        : transactionFields,
    [extraFields, transactionFields]
  );
  const groups = groupByFields(
    list.rows,
    list.search.groupBy,
    transactionGroupKey
  );
  const sections = groups ?? [{ key: "", label: "", items: list.rows }];

  return (
    <div className="grid gap-3">
      <SearchBar
        fields={fields}
        groupableFields={TRANSACTION_GROUPABLE_FIELDS}
        sortableFields={TRANSACTION_SORTABLE_FIELDS}
        defaultSearchField={TRANSACTION_DEFAULT_SEARCH_FIELD}
        initialSort={{ field: "date", direction: "desc" }}
        initialDomain={initialDomain}
        placeholder="Search transactions"
        onQueryChange={(query) => {
          list.setSearch(query);
          onQueryChange?.(query);
        }}
      />
      {sections.map((section, index) => (
        <RelatedList<Transaction>
          key={section.key}
          title={
            section.label
              ? `${section.label} (${section.items.length})`
              : "Transactions"
          }
          rows={section.items}
          rowKey={(row) => row.id}
          isLoading={list.isLoading}
          error={list.error}
          emptyText={emptyText}
          columns={[
            {
              key: "name",
              header: "Name",
              cell: (row) => (
                <Link
                  to={routes.transaction(row.id)}
                  className="font-medium text-pine underline-offset-2 hover:underline dark:text-emerald-300"
                >
                  {row.name}
                </Link>
              )
            },
            {
              key: "date",
              header: "Date",
              cell: (row) => formatTransactionDate(row)
            },
            ...(scope.field === "groupId"
              ? [
                  {
                    key: "account",
                    header: "Account",
                    cell: (row: Transaction) =>
                      row.account?.name ?? "No account"
                  }
                ]
              : []),
            {
              key: "category",
              header: "Category",
              cell: (row) => row.category?.name ?? "Uncategorized"
            },
            {
              key: "amount",
              header: "Amount",
              align: "right",
              cell: (row) => formatMoney(row.amount, row.executionCurrency)
            }
          ]}
          headerActions={
            index === 0 ? <ListViewPagination {...list.pager} /> : undefined
          }
        />
      ))}
    </div>
  );
}
