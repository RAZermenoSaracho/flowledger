import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "../components/Card";
import { apiRequest } from "../services/api";
import type { CashflowRow, CategoryReportRow, Summary } from "../types/api";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const colors = ["#176b52", "#f97359", "#2563eb", "#ca8a04", "#7c3aed", "#0f766e"];

export function ReportsPage() {
  const summaryQuery = useQuery({
    queryKey: ["summary"],
    queryFn: async () => (await apiRequest<{ summary: Summary }>("/reports/summary")).summary
  });
  const categoryQuery = useQuery({
    queryKey: ["category-report"],
    queryFn: async () => (await apiRequest<{ categories: CategoryReportRow[] }>("/reports/by-category")).categories
  });
  const cashflowQuery = useQuery({
    queryKey: ["cashflow"],
    queryFn: async () => (await apiRequest<{ cashflow: CashflowRow[] }>("/reports/monthly-cashflow")).cashflow
  });

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Income</p>
          <p className="mt-2 text-2xl font-bold text-pine">{money.format(summaryQuery.data?.totalIncome ?? 0)}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Expenses</p>
          <p className="mt-2 text-2xl font-bold text-coral">{money.format(summaryQuery.data?.totalExpenses ?? 0)}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Balance</p>
          <p className="mt-2 text-2xl font-bold">{money.format(summaryQuery.data?.currentBalance ?? 0)}</p>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">By category</h2>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryQuery.data ?? []} dataKey="total" nameKey="categoryName" outerRadius={110} label>
                  {(categoryQuery.data ?? []).map((row, index) => (
                    <Cell key={`${row.categoryName}-${row.type}`} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => money.format(Number(value))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Monthly cashflow</h2>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashflowQuery.data ?? []}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => money.format(Number(value))} />
                <Legend />
                <Bar dataKey="income" fill="#176b52" />
                <Bar dataKey="expenses" fill="#f97359" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>
    </div>
  );
}
