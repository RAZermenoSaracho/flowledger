import { Link } from "react-router-dom";
import { RelatedList } from "../../../components/RelatedList";
import { routes } from "../../../constants/routes";
import type { RelatedTransaction, Transaction } from "../../../types/transactions.types";
import { formatMoney } from "../../../utils/currency";
import { formatTransactionDate } from "../../../utils/dateTime";
import { formatPublicUser } from "../../../utils/publicUser";

/** Whether `transaction` has anything for the Related transactions tab: the viewer's original expense or a participant's origin summary. */
export function hasRelatedRecords(transaction: Transaction): boolean {
  return (transaction.relatedTransactions ?? []).length > 0 || Boolean(transaction.settlementOrigin);
}

/**
 * Related transactions tab of the Transaction Form View: the viewer's original expense (navigable) for a settlement,
 * or a participant's non-navigable summary of the expense they settled.
 */
export function TransactionRelatedTab({ transaction }: { transaction: Transaction }) {
  const origins = transaction.relatedTransactions ?? [];
  const summary = transaction.settlementOrigin;

  return (
    <div className="grid gap-6">
      {origins.length > 0 ? (
        <RelatedList<RelatedTransaction>
          title="Original expense"
          rows={origins}
          rowKey={(row) => row.id}
          emptyText="No original expense."
          columns={[
            {
              key: "name",
              header: "Transaction",
              cell: (row) => (
                <Link className="font-semibold text-pine underline dark:text-emerald-300" to={routes.transaction(row.id)}>
                  {row.description}
                </Link>
              )
            },
            { key: "amount", header: "Amount", align: "right", cell: (row) => formatMoney(row.amount, row.currency) },
            { key: "date", header: "Date", cell: (row) => formatTransactionDate(row) }
          ]}
        />
      ) : null}
      {summary ? (
        <RelatedList<NonNullable<Transaction["settlementOrigin"]>>
          title="Settles shared expense"
          rows={[summary]}
          rowKey={() => "origin"}
          emptyText="No shared expense."
          columns={[
            { key: "name", header: "Expense", cell: (row) => row.title },
            { key: "owner", header: "Owner", cell: (row) => formatPublicUser(row.owner) },
            { key: "amount", header: "Total", align: "right", cell: (row) => formatMoney(row.amount, row.currency) },
            { key: "date", header: "Date", cell: (row) => formatTransactionDate(row) }
          ]}
        />
      ) : null}
    </div>
  );
}
