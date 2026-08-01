import { Link } from "react-router-dom";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { formatMoney } from "../../../utils/currency";
import { parseTransactionAmount } from "../../../utils/transactions";
import type { Transaction } from "../../../types/api";

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
      <h2 className="text-lg font-semibold">Transactions</h2>
      <div className="mt-4 grid gap-4">
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
                return (
                  <div
                    key={transaction.id}
                    className={`grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto_auto] md:items-center ${
                      isPendingClassification
                        ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
                        : "border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <div>
                      <Link
                        className="font-semibold text-pine dark:text-emerald-300"
                        to={`/transactions/${transaction.id}`}
                      >
                        {transaction.name}
                      </Link>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {new Date(transaction.date).toLocaleDateString()} ·{" "}
                        {transaction.type === "transfer"
                          ? "Transfer"
                          : (transaction.category?.name ?? "Uncategorized")}{" "}
                        · {transactionAccountLabel(transaction)}
                        {transaction.group
                          ? ` · ${transaction.group.name}${
                              transaction.category
                                ? ` / ${transaction.category.name}`
                                : ""
                            }`
                          : ""}
                      </p>
                      {isPendingClassification ? (
                        <p className="mt-1 text-sm font-semibold text-amber-800 dark:text-amber-200">
                          {transaction.type === "transfer"
                            ? "Pending classification: add from and to accounts."
                            : "Pending classification: add a category and account."}
                        </p>
                      ) : null}
                    </div>
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
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => onEdit(transaction)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={isDeleting}
                        onClick={() => onDelete(transaction)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
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
