import { Link } from "react-router-dom";
import { Card } from "../../../components/Card";
import { RecordCard, type RecordCardAction } from "../../../components/RecordCard";
import { formatMoney } from "../../../utils/currency";
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

/** Grouped list of transactions with per-row edit/delete actions. */
export function TransactionList({
  groupedTransactions,
  totalCount,
  isDeleting,
  onEdit,
  onDelete
}: {
  groupedTransactions: { key: string; label: string; items: Transaction[] }[];
  totalCount: number;
  isDeleting: boolean;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  return (
    <Card>
      <div className="grid gap-4">
        {groupedTransactions.map((section) => (
          <div key={section.key || "all"} className="grid gap-3">
            {section.label ? (
              <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
                {section.label}
              </h3>
            ) : null}
            <div className="grid gap-3">
              {section.items.map((transaction) => {
                const isPendingClassification =
                  needsClassification(transaction);
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
                    key={transaction.id}
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
                        {new Date(transaction.date).toLocaleDateString()} ·{" "}
                        {transaction.type === "transfer"
                          ? "Transfer"
                          : (transaction.category?.name ??
                            "Uncategorized")}{" "}
                        · {transactionAccountLabel(transaction)}
                        {transaction.group
                          ? ` · ${transaction.group.name}${
                              transaction.category
                                ? ` / ${transaction.category.name}`
                                : ""
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
              })}
            </div>
          </div>
        ))}
        {totalCount === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No transactions found.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
