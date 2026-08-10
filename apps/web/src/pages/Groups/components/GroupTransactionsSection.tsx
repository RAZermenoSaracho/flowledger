import type { Group } from "../../../types/groups.types";
import { formatMoney } from "../../../utils/currency";

/** Section listing a group's recent transactions. */
export function GroupTransactionsSection({
  transactions
}: {
  transactions: Group["transactions"];
}) {
  const items = transactions ?? [];

  return (
    <section>
      <h3 className="font-semibold">Latest Group Transactions</h3>
      <div className="mt-3 grid gap-2">
        {items.map((transaction) => (
          <div
            key={transaction.id}
            className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950"
          >
            <div className="flex flex-col justify-between gap-1 sm:flex-row">
              <p className="min-w-0 truncate font-medium">{transaction.name}</p>
              <p className="shrink-0 font-semibold">
                {formatMoney(transaction.amount, transaction.executionCurrency)}
              </p>
            </div>
            <p className="text-slate-500 dark:text-slate-400">
              {transaction.category?.name ?? "No group category"} ·{" "}
              {new Date(transaction.date).toLocaleDateString()}
            </p>
          </div>
        ))}
        {items.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No group transactions for your account yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}
