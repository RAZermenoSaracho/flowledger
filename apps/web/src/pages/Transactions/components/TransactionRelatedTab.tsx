import { Link } from "react-router-dom";
import { RelatedList } from "../../../components/RelatedList";
import { routes } from "../../../constants/routes";
import type { Transaction } from "../../../types/transactions.types";
import { formatMoney } from "../../../utils/currency";
import { formatTransactionDate } from "../../../utils/dateTime";
import type { RelatedSettlementRow } from "../types/transactions.types";
import { relatedSettlementRows } from "../utils/transactionDraft";

/** Whether `transaction` has anything to show in the Related tab: a linked settlement or an originating import. */
export function hasRelatedRecords(transaction: Transaction): boolean {
  return relatedSettlementRows(transaction).length > 0 || Boolean(transaction.providerImportedTransaction);
}

/** Related tab of the Transaction Form View: read-only lists of linked settlement transactions and the originating provider import. */
export function TransactionRelatedTab({ transaction }: { transaction: Transaction }) {
  const imported = transaction.providerImportedTransaction;
  return (
    <div className="grid gap-6">
      <RelatedList<RelatedSettlementRow>
        title="Settlement transactions"
        rows={relatedSettlementRows(transaction)}
        rowKey={(row) => row.id}
        emptyText="No settlement transactions."
        columns={[
          {
            key: "name",
            header: "Transaction",
            cell: (row) => (
              <Link className="font-semibold text-pine underline dark:text-emerald-300" to={routes.transaction(row.transaction.id)}>
                {row.transaction.name}
              </Link>
            )
          },
          {
            key: "amount",
            header: "Amount",
            align: "right",
            cell: (row) => formatMoney(row.transaction.amount, row.transaction.executionCurrency)
          },
          { key: "date", header: "Date", cell: (row) => formatTransactionDate(row.transaction) }
        ]}
      />
      <RelatedList<{ id: string; transactionDate: string }>
        title="Imported from provider"
        rows={imported ? [{ id: transaction.id, transactionDate: imported.transactionDate }] : []}
        rowKey={(row) => row.id}
        emptyText="This transaction was not imported."
        columns={[
          {
            key: "date",
            header: "Provider date",
            cell: (row) => formatTransactionDate({ date: row.transactionDate })
          }
        ]}
      />
    </div>
  );
}
