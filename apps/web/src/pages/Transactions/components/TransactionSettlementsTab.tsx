import { Link } from "react-router-dom";
import { RelatedList } from "../../../components/RelatedList";
import { routes } from "../../../constants/routes";
import type { RelatedSettlement, Transaction } from "../../../types/transactions.types";
import { formatMoney } from "../../../utils/currency";
import { formatTransactionDate } from "../../../utils/dateTime";
import { formatEnumLabel } from "../../../utils/enumLabels";
import { formatPublicUser } from "../../../utils/publicUser";

/** Whether `transaction` is an original expense with settlement requests to list. */
export function hasRelatedSettlements(transaction: Transaction): boolean {
  return (transaction.relatedSettlements ?? []).length > 0;
}

/**
 * Related settlements tab: every settlement request on the original expense, including pending and rejected ones.
 * The transaction link only appears for the viewer's own approved settlement transaction.
 */
export function TransactionSettlementsTab({ transaction }: { transaction: Transaction }) {
  return (
    <RelatedList<RelatedSettlement>
      title="Settlements"
      rows={transaction.relatedSettlements ?? []}
      rowKey={(row) => row.id}
      emptyText="No settlements."
      columns={[
        { key: "counterparty", header: "Counterparty", cell: (row) => formatPublicUser(row.counterparty) },
        { key: "amount", header: "Amount", align: "right", cell: (row) => formatMoney(row.amount, row.currency) },
        { key: "requested", header: "Requested", cell: (row) => formatTransactionDate({ date: row.createdAt }) },
        { key: "status", header: "Status", cell: (row) => formatEnumLabel(row.status) },
        {
          key: "transaction",
          header: "Transaction",
          cell: (row) =>
            row.transaction ? (
              <Link className="font-semibold text-pine underline dark:text-emerald-300" to={routes.transaction(row.transaction.id)}>
                {row.transaction.description}
              </Link>
            ) : (
              "-"
            )
        }
      ]}
    />
  );
}
