import { Link } from "react-router-dom";
import { RelatedList } from "../../../components/RelatedList";
import { routes } from "../../../constants/routes";
import type { RelatedTransaction, Transaction } from "../../../types/transactions.types";
import { formatMoney } from "../../../utils/currency";
import { formatTransactionDate } from "../../../utils/dateTime";
import { formatEnumLabel } from "../../../utils/enumLabels";
import { formatPublicUser } from "../../../utils/publicUser";

/** Whether `transaction` has anything to show in the Related tab: viewer-owned settlement-chain transactions or a participant's origin summary. */
export function hasRelatedRecords(transaction: Transaction): boolean {
  return (transaction.relatedTransactions ?? []).length > 0 || Boolean(transaction.settlementOrigin);
}

/**
 * Related tab of the Transaction Form View: read-only lists built from the server's settlement-chain data.
 * Navigable rows are always transactions the viewer owns; a participant's origin is a plain summary.
 */
export function TransactionRelatedTab({ transaction }: { transaction: Transaction }) {
  const related = transaction.relatedTransactions ?? [];
  const settlements = related.filter((row) => row.relation === "settlement");
  const origins = related.filter((row) => row.relation === "origin");
  const summary = transaction.settlementOrigin;
  const columns = [
    {
      key: "name",
      header: "Transaction",
      cell: (row: RelatedTransaction) => (
        <Link className="font-semibold text-pine underline dark:text-emerald-300" to={routes.transaction(row.id)}>
          {row.description}
        </Link>
      )
    },
    {
      key: "amount",
      header: "Amount",
      align: "right" as const,
      cell: (row: RelatedTransaction) => formatMoney(row.amount, row.currency)
    },
    { key: "date", header: "Date", cell: (row: RelatedTransaction) => formatTransactionDate(row) },
    { key: "status", header: "Status", cell: (row: RelatedTransaction) => formatEnumLabel(row.settlementStatus) }
  ];

  return (
    <div className="grid gap-6">
      {settlements.length > 0 ? (
        <RelatedList<RelatedTransaction>
          title="Settlement transactions"
          rows={settlements}
          rowKey={(row) => row.id}
          emptyText="No settlement transactions."
          columns={columns}
        />
      ) : null}
      {origins.length > 0 ? (
        <RelatedList<RelatedTransaction>
          title="Original expense"
          rows={origins}
          rowKey={(row) => row.id}
          emptyText="No original expense."
          columns={columns}
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
