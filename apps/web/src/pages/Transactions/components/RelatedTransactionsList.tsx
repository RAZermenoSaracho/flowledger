import { Link } from "react-router-dom";
import { routes } from "../../../constants/routes";
import { useRelatedTransactions } from "../hooks/useRelatedTransactions";
import { TRANSACTION_SORTABLE_FIELDS } from "../utils/transactionSearchFields";
import type {
  RelatedTransactionsScope,
  Transaction
} from "../../../types/transactions.types";
import type { SearchFieldConfig } from "../../../utils/searchDomain";
import { formatMoney } from "../../../utils/currency";
import { formatTransactionDate } from "../../../utils/dateTime";
import { ListViewPagination } from "../../../components/ListView";
import { RelatedList } from "../../../components/RelatedList";
import { SearchBar } from "../../../components/SearchBar";

const RELATED_TRANSACTION_SEARCH_FIELDS: SearchFieldConfig[] = [
  { name: "name", label: "Name", type: "string" }
];

/**
 * "Transactions" tab body for an account or group Form View: a name search and the scope's
 * transactions (newest first by default) with the range pager in the header. Render it with `key` set to
 * the record id so paging and search reset when the record changes.
 */
export function RelatedTransactionsList({
  scope,
  emptyText
}: {
  scope: RelatedTransactionsScope;
  emptyText: string;
}) {
  const list = useRelatedTransactions(scope);

  return (
    <div className="grid gap-3">
      <SearchBar
        fields={RELATED_TRANSACTION_SEARCH_FIELDS}
        sortableFields={TRANSACTION_SORTABLE_FIELDS}
        defaultSearchField="name"
        initialSort={{ field: "date", direction: "desc" }}
        placeholder="Search by name"
        onQueryChange={list.setSearch}
      />
      <RelatedList<Transaction>
        title="Transactions"
        rows={list.rows}
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
                  cell: (row: Transaction) => row.account?.name ?? "No account"
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
        headerActions={<ListViewPagination {...list.pager} />}
      />
    </div>
  );
}
