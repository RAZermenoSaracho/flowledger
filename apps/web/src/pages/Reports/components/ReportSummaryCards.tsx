import { Card } from "../../../components/Card";
import type { CreditCardCredits } from "@flowledger/shared";
import { formatMoney } from "../../../utils/currency";
import { isNonZero } from "../../../utils/money";

/** Income/expenses/balance summary tiles for reports, plus a separate "Credit card credits" tile (never part of income) when the range has any. */
export function ReportSummaryCards({
  currency,
  totalIncome,
  totalExpenses,
  reportBalance,
  reportModeLabel,
  totalGrossIncome,
  totalGrossExpenses,
  totalExpenseReimbursements,
  creditCardCredits
}: {
  currency: string;
  totalIncome: number;
  totalExpenses: number;
  reportBalance: number;
  reportModeLabel: string;
  totalGrossIncome: number;
  totalGrossExpenses: number;
  totalExpenseReimbursements: number;
  creditCardCredits?: CreditCardCredits;
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
      {creditCardCredits && isNonZero(creditCardCredits.total) ? (
        <Card className="min-w-0 md:col-span-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Credit card credits</p>
          <p className="mt-2 break-words text-xl font-bold sm:text-2xl">
            {formatMoney(creditCardCredits.total, currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Not included in income. Transfers {formatMoney(creditCardCredits.transfers, currency)} | Payments{" "}
            {formatMoney(creditCardCredits.payments, currency)} | Refunds{" "}
            {formatMoney(creditCardCredits.refunds, currency)} | Cashback{" "}
            {formatMoney(creditCardCredits.cashback, currency)} | Other{" "}
            {formatMoney(creditCardCredits.other, currency)}
          </p>
        </Card>
      ) : null}
    </section>
  );
}
