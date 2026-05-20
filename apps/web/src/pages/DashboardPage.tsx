import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "../components/Card";
import { apiRequest } from "../services/api";
import type { CashflowRow, Summary, Transaction } from "../types/api";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function DashboardPage() {
  const summaryQuery = useQuery({
    queryKey: ["summary"],
    queryFn: async () => (await apiRequest<{ summary: Summary }>("/reports/summary")).summary
  });
  const cashflowQuery = useQuery({
    queryKey: ["cashflow"],
    queryFn: async () => (await apiRequest<{ cashflow: CashflowRow[] }>("/reports/monthly-cashflow")).cashflow
  });
  const transactionsQuery = useQuery({
    queryKey: ["transactions", "recent"],
    queryFn: async () => (await apiRequest<{ transactions: Transaction[] }>("/transactions")).transactions.slice(0, 5)
  });

  const summary = summaryQuery.data ?? { totalIncome: 0, totalExpenses: 0, currentBalance: 0 };

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Metric title="Total income" value={money.format(summary.totalIncome)} />
        <Metric title="Total expenses" value={money.format(summary.totalExpenses)} />
        <Metric title="Current balance" value={money.format(summary.currentBalance)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="text-lg font-semibold">Monthly cashflow</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflowQuery.data ?? []}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => money.format(Number(value))} />
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
              <div key={transaction.id} className="flex items-center justify-between rounded-md bg-slate-50 p-3 text-sm">
                <span>{transaction.name}</span>
                <span className={transaction.type === "income" ? "font-semibold text-pine" : "font-semibold text-coral"}>
                  {money.format(transaction.amount)}
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
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </Card>
  );
}
