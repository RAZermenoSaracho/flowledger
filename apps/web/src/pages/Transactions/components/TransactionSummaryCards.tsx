import { Card } from "../../../components/Card";
import { formatMoney } from "../../../utils/currency";

/** Income/expenses/balance summary tiles for the transactions list. */
export function TransactionSummaryCards({
  income,
  expenses,
  balance,
  currency,
  hasActiveFilters,
  transactionCount
}: {
  income: number;
  expenses: number;
  balance: number;
  currency: string;
  hasActiveFilters: boolean;
  transactionCount: number;
}) {
  const visibleLabel = hasActiveFilters
    ? "Filtered transactions"
    : "Visible transactions";

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Total income
        </p>
        <p className="mt-2 text-2xl font-bold text-pine dark:text-emerald-300">
          {formatMoney(income, currency)}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {visibleLabel}
        </p>
      </Card>
      <Card>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Total expenses
        </p>
        <p className="mt-2 text-2xl font-bold text-coral dark:text-orange-300">
          {formatMoney(expenses, currency)}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {visibleLabel}
        </p>
      </Card>
      <Card>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Balance
        </p>
        <p
          className={`mt-2 text-2xl font-bold ${
            balance >= 0
              ? "text-pine dark:text-emerald-300"
              : "text-coral dark:text-orange-300"
          }`}
        >
          {formatMoney(balance, currency)}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {transactionCount} transaction{transactionCount === 1 ? "" : "s"}
        </p>
      </Card>
    </div>
  );
}
