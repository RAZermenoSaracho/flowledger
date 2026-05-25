import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card } from "../components/Card";
import { apiRequest } from "../services/api";
import type { CashflowRow, CategoryReportRow, Summary } from "../types/api";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});
const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1
});
const colors = [
  "#176b52",
  "#f97359",
  "#2563eb",
  "#ca8a04",
  "#7c3aed",
  "#0f766e",
  "#be185d",
  "#475569"
];

type CategoryChartRow = CategoryReportRow & {
  displayName: string;
  fill: string;
};

export function ReportsPage() {
  const summaryQuery = useQuery({
    queryKey: ["summary"],
    queryFn: async () =>
      (await apiRequest<{ summary: Summary }>("/reports/summary")).summary
  });
  const categoryQuery = useQuery({
    queryKey: ["category-report"],
    queryFn: async () =>
      (
        await apiRequest<{ categories: CategoryReportRow[] }>(
          "/reports/by-category"
        )
      ).categories
  });
  const cashflowQuery = useQuery({
    queryKey: ["cashflow"],
    queryFn: async () =>
      (
        await apiRequest<{ cashflow: CashflowRow[] }>(
          "/reports/monthly-cashflow"
        )
      ).cashflow
  });
  const categories = categoryQuery.data ?? [];
  const expenseCategories = prepareCategoryRows(categories, "expense");
  const incomeCategories = prepareCategoryRows(categories, "income");

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="min-w-0">
          <p className="text-sm text-slate-500 dark:text-slate-400">Income</p>
          <p className="mt-2 break-words text-xl font-bold text-pine dark:text-emerald-300 sm:text-2xl">
            {money.format(summaryQuery.data?.totalIncome ?? 0)}
          </p>
        </Card>
        <Card className="min-w-0">
          <p className="text-sm text-slate-500 dark:text-slate-400">Expenses</p>
          <p className="mt-2 break-words text-xl font-bold text-coral dark:text-orange-300 sm:text-2xl">
            {money.format(summaryQuery.data?.totalExpenses ?? 0)}
          </p>
        </Card>
        <Card className="min-w-0">
          <p className="text-sm text-slate-500 dark:text-slate-400">Balance</p>
          <p className="mt-2 break-words text-xl font-bold sm:text-2xl">
            {money.format(summaryQuery.data?.currentBalance ?? 0)}
          </p>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <CategoryBreakdown
          title="Expenses by category"
          rows={expenseCategories}
          emptyText="No expense categories yet."
        />
        <CategoryBreakdown
          title="Income by category"
          rows={incomeCategories}
          emptyText="No income categories yet."
        />
      </section>

      <Card className="min-w-0">
        <h2 className="text-lg font-semibold">Monthly cashflow</h2>
        <div className="mt-4 h-80 min-w-0 overflow-hidden sm:h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={cashflowQuery.data ?? []}
              margin={{ top: 12, right: 8, bottom: 8, left: 0 }}
            >
              <XAxis dataKey="month" tick={{ fontSize: 12 }} tickMargin={8} />
              <YAxis
                tickFormatter={(value) => compactMoney.format(Number(value))}
                tick={{ fontSize: 12 }}
                width={64}
              />
              <Tooltip formatter={(value) => money.format(Number(value))} />
              <Bar
                dataKey="income"
                name="Income"
                fill="#176b52"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="expenses"
                name="Expenses"
                fill="#f97359"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function CategoryBreakdown({
  title,
  rows,
  emptyText
}: {
  title: string;
  rows: CategoryChartRow[];
  emptyText: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="min-w-0 text-lg font-semibold">{title}</h2>
        <span className="min-w-0 break-words text-right text-sm font-semibold text-slate-600 dark:text-slate-300">
          {money.format(total)}
        </span>
      </div>

      {rows.length > 0 ? (
        <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(12rem,0.8fr)] md:items-center">
          <div className="h-64 min-w-0 overflow-hidden sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Pie
                  data={rows}
                  dataKey="total"
                  nameKey="displayName"
                  innerRadius="48%"
                  outerRadius="78%"
                  paddingAngle={2}
                  labelLine={false}
                  label={renderPieLabel}
                >
                  {rows.map((row) => (
                    <Cell
                      key={`${row.categoryId ?? row.displayName}-${row.type}`}
                      fill={row.fill}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => money.format(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid min-w-0 gap-2">
            {rows.map((row) => (
              <div
                key={`${row.categoryId ?? row.displayName}-${row.type}-legend`}
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_minmax(0,max-content)] items-center gap-2 text-sm"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: row.fill }}
                />
                <span
                  className="truncate text-slate-700 dark:text-slate-300"
                  title={row.displayName}
                >
                  {row.displayName}
                </span>
                <span className="min-w-0 break-words text-right font-semibold text-slate-900 dark:text-slate-100">
                  {money.format(row.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex h-48 items-center justify-center rounded-md bg-slate-50 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
          {emptyText}
        </div>
      )}
    </Card>
  );
}

function prepareCategoryRows(
  rows: CategoryReportRow[],
  type: "income" | "expense"
): CategoryChartRow[] {
  return rows
    .filter((row) => row.type === type && row.total > 0)
    .map((row, index) => {
      const categoryMismatch =
        row.categoryType && row.categoryType !== row.type;
      const displayName = categoryMismatch
        ? `${row.categoryName} (${row.categoryType} category)`
        : row.categoryName;

      return {
        ...row,
        displayName,
        fill: row.categoryColor ?? colors[index % colors.length] ?? "#64748b"
      };
    });
}

function renderPieLabel({
  cx,
  cy,
  innerRadius,
  midAngle,
  outerRadius,
  percent
}: {
  cx?: number | string;
  cy?: number | string;
  innerRadius?: number | string;
  midAngle?: number;
  outerRadius?: number | string;
  percent?: number;
}) {
  if (!percent || percent < 0.08) return "";

  const centerX = Number(cx);
  const centerY = Number(cy);
  const inner = Number(innerRadius);
  const outer = Number(outerRadius);
  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(inner) ||
    !Number.isFinite(outer) ||
    typeof midAngle !== "number"
  ) {
    return "";
  }

  const radius = inner + (outer - inner) * 0.55;
  const angle = -midAngle * (Math.PI / 180);
  const x = centerX + radius * Math.cos(angle);
  const y = centerY + radius * Math.sin(angle);

  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={700}
    >
      {Math.round(percent * 100)}%
    </text>
  );
}
