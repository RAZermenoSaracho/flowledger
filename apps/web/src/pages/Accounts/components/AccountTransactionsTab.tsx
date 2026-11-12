import { Link } from "react-router-dom";
import { Button } from "../../../components/Button";
import { RelatedList } from "../../../components/RelatedList";
import { routes } from "../../../constants/routes";
import type { Transaction } from "../../../types/transactions.types";
import { formatMoney } from "../../../utils/currency";
import { formatTransactionDate } from "../../../utils/dateTime";
import { useAccountTransactions } from "../hooks/useAccountTransactions";

/** "Related transactions" tab of the account Form View: the account's transactions, newest first, with Previous/Next server paging. */
export function AccountTransactionsTab({ accountId }: { accountId: string }) {
  const list = useAccountTransactions(accountId);

  return (
    <RelatedList<Transaction>
      title="Related transactions"
      rows={list.rows}
      rowKey={(row) => row.id}
      isLoading={list.isLoading}
      error={list.error}
      emptyText="No transactions for this account yet."
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
      footer={
        <div className="flex items-center justify-between gap-3 pt-3">
          <Button
            type="button"
            variant="secondary"
            disabled={!list.hasPrevious || list.isFetching}
            onClick={list.goPrevious}
          >
            Previous
          </Button>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Page {list.page}
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={!list.hasNext || list.isFetching}
            onClick={list.goNext}
          >
            Next
          </Button>
        </div>
      }
    />
  );
}
