import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "../../components/Card";
import { useAuth } from "../../hooks/useAuth";
import { getMonthlyCashflowReport, getSummaryReport } from "../../services/reports.client";
import { listTransactions } from "../../services/transactions.client";
import { formatMoney } from "../../utils/currency";

/** Landing page summarizing account balances and monthly cashflow, formatted in the viewer's preferred currency (USD when unset). */
export function DashboardPage() {
  const auth = useAuth();
  const currency = auth.user?.preferredCurrency || "USD";
  const summaryQuery = useQuery({
    queryKey: ["summary"],
    queryFn: async () => (await getSummaryReport({})).summary
  });
  const cashflowQuery = useQuery({
    queryKey: ["cashflow"],
    queryFn: async () => (await getMonthlyCashflowReport({})).cashflow
  });
  const transactionsQuery = useQuery({
    queryKey: ["transactions", "recent"],
    queryFn: async () =>
      (
        await listTransactions({
          sort: [{ field: "date", direction: "desc" }],
          pagination: { kind: "offset", page: 1, pageSize: 5 }
        })
      ).data
  });

  const summary = summaryQuery.data ?? {
    totalIncome: 0,
    totalGrossIncome: 0,
    totalNetIncome: 0,
    totalExpenses: 0,
    totalGrossExpenses: 0,
    totalExpenseReimbursements: 0,
    totalNetExpenses: 0,
    currentBalance: 0,
    reportIncome: 0,
    reportExpenses: 0,
    reportBalance: 0
  };

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Metric title="Total income" value={formatMoney(summary.totalIncome, currency)} />
        <Metric title="Net expenses" value={formatMoney(summary.totalNetExpenses, currency)} />
        <Metric title="Current balance" value={formatMoney(summary.currentBalance, currency)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="text-lg font-semibold">Monthly cashflow</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflowQuery.data ?? []}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => formatMoney(Number(value), currency)} />
                <Area type="monotone" dataKey="income" stroke="#176b52" fill="#dff8ea" />
                <Area type="monotone" dataKey="expenses" stroke="#f97359" fill="#ffe1da" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <div className="mt-4 grid gap-3">
            {(transactionsQuery.data ?? []).map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950">
                <span>{transaction.name}</span>
                <span
                  className={
                    transaction.type === "income"
                      ? "font-semibold text-pine dark:text-emerald-300"
                      : transaction.type === "transfer"
                        ? "font-semibold text-slate-700 dark:text-slate-200"
                        : "font-semibold text-coral dark:text-orange-300"
                  }
                >
                  {formatMoney(transaction.amount, transaction.executionCurrency)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </Card>
  );
}
