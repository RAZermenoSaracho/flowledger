import { Card } from "../../../components/Card";
import { formatMoney } from "../../../utils/currency";

export function ReportSummaryCards({
  currency,
  totalIncome,
  totalExpenses,
  reportBalance,
  reportModeLabel,
  totalGrossIncome,
  totalGrossExpenses,
  totalExpenseReimbursements
}: {
  currency: string;
  totalIncome: number;
  totalExpenses: number;
  reportBalance: number;
  reportModeLabel: string;
  totalGrossIncome: number;
  totalGrossExpenses: number;
  totalExpenseReimbursements: number;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <Card className="min-w-0">
        <p className="text-sm text-slate-500 dark:text-slate-400">Income</p>
        <p className="mt-2 break-words text-xl font-bold text-pine dark:text-emerald-300 sm:text-2xl">
          {formatMoney(totalIncome, currency)}
        </p>
        {totalExpenseReimbursements > 0 ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Gross {formatMoney(totalGrossIncome, currency)} | Offset{" "}
            {formatMoney(-totalExpenseReimbursements, currency)}
          </p>
        ) : null}
      </Card>
      <Card className="min-w-0">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {reportModeLabel} expenses
        </p>
        <p className="mt-2 break-words text-xl font-bold text-coral dark:text-orange-300 sm:text-2xl">
          {formatMoney(totalExpenses, currency)}
        </p>
        {totalExpenseReimbursements > 0 ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Gross {formatMoney(totalGrossExpenses, currency)} | Offset{" "}
            {formatMoney(-totalExpenseReimbursements, currency)}
          </p>
        ) : null}
      </Card>
      <Card className="min-w-0">
        <p className="text-sm text-slate-500 dark:text-slate-400">Balance</p>
        <p className="mt-2 break-words text-xl font-bold sm:text-2xl">
          {formatMoney(reportBalance, currency)}
        </p>
      </Card>
    </section>
  );
}
