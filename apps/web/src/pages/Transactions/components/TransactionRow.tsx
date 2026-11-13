import { Link } from "react-router-dom";
import {
  RecordCard,
  type RecordCardAction
} from "../../../components/RecordCard";
import { formatMoney } from "../../../utils/currency";
import { formatTransactionDate } from "../../../utils/dateTime";
import { parseTransactionAmount } from "../utils/transactions";
import type { Transaction } from "../../../types/transactions.types";

function needsClassification(transaction: Transaction) {
  if (transaction.type === "transfer") {
    return !transaction.accountId || !transaction.transferToAccountId;
  }

  return !transaction.accountId || !transaction.categoryId;
}

function transactionAccountLabel(transaction: Transaction) {
  if (transaction.type === "transfer") {
    return `${transaction.account?.name ?? "No from account"} -> ${
      transaction.transferToAccount?.name ?? "No to account"
    }`;
  }

  return transaction.account?.name ?? "No account";
}

/** One transaction row for the Transactions `ListView`: classification highlight, amount colour and an edit/delete actions menu. */
export function TransactionRow({
  transaction,
  isDeleting,
  onEdit,
  onDelete
}: {
  transaction: Transaction;
  isDeleting: boolean;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  const isPendingClassification = needsClassification(transaction);
  const actions: RecordCardAction[] = [
    {
      key: "edit",
      label: "Edit",
      onClick: () => onEdit(transaction)
    },
    {
      key: "delete",
      label: "Delete",
      variant: "danger",
      disabled: isDeleting,
      onClick: () => onDelete(transaction)
    }
  ];
  return (
    <RecordCard
      highlightClassName={
        isPendingClassification
          ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
          : undefined
      }
      title={
        <Link
          className="font-semibold text-pine dark:text-emerald-300"
          to={`/transactions/${transaction.id}`}
        >
          {transaction.name}
        </Link>
      }
      subtitle={
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {formatTransactionDate(transaction)} ·{" "}
          {transaction.type === "transfer"
            ? "Transfer"
            : (transaction.category?.name ?? "Uncategorized")}{" "}
          · {transactionAccountLabel(transaction)}
          {transaction.group
            ? ` · ${transaction.group.name}${
                transaction.category ? ` / ${transaction.category.name}` : ""
              }`
            : ""}
        </p>
      }
      trailing={
        <span
          className={
            transaction.type === "income"
              ? "font-semibold text-pine dark:text-emerald-300"
              : transaction.type === "transfer"
                ? "font-semibold text-slate-700 dark:text-slate-200"
                : "font-semibold text-coral dark:text-orange-300"
          }
        >
          {formatMoney(
            parseTransactionAmount(transaction.amount),
            transaction.executionCurrency
          )}
        </span>
      }
      actions={actions}
      actionsLabel={`Actions for ${transaction.name}`}
    >
      {isPendingClassification ? (
        <p className="mt-1 text-sm font-semibold text-amber-800 dark:text-amber-200">
          {transaction.type === "transfer"
            ? "Pending classification: add from and to accounts."
            : "Pending classification: add a category and account."}
        </p>
      ) : null}
    </RecordCard>
  );
}
