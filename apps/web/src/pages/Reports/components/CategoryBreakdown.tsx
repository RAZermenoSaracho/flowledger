import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "../../../components/Card";
import type { CategoryChartRow } from "../../../types/reports.types";
import { formatMoney } from "../../../utils/currency";

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

export function CategoryBreakdown({
  title,
  rows,
  emptyText,
  type,
  currency
}: {
  title: string;
  rows: CategoryChartRow[];
  emptyText: string;
  type: "income" | "expense";
  currency: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.displayTotal, 0);
  const chartRows = rows.filter((row) => row.chartTotal > 0);

  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="min-w-0 text-lg font-semibold">{title}</h2>
        <span className="min-w-0 break-words text-right text-sm font-semibold text-slate-600 dark:text-slate-300">
          {formatMoney(total, currency)}
        </span>
      </div>

      {rows.length > 0 ? (
        <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(12rem,0.8fr)] md:items-center">
          <div className="h-64 min-w-0 overflow-hidden sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Pie
                  data={chartRows}
                  dataKey="chartTotal"
                  nameKey="displayName"
                  innerRadius="48%"
                  outerRadius="78%"
                  paddingAngle={2}
                  labelLine={false}
                  label={renderPieLabel}
                >
                  {chartRows.map((row) => (
                    <Cell
                      key={`${row.categoryId ?? row.displayName}-${row.type}`}
                      fill={row.fill}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatMoney(Number(value), currency)}
                />
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
                  {formatMoney(row.displayTotal, currency)}
                </span>
                {type === "expense" && row.reimbursementTotal > 0 ? (
                  <span className="col-span-3 min-w-0 break-words pl-5 text-right text-xs text-slate-500 dark:text-slate-400">
                    Gross {formatMoney(row.grossExpenseTotal, currency)} |
                    Offset {formatMoney(-row.reimbursementTotal, currency)} |
                    Net {formatMoney(row.netExpenseTotal, currency)}
                  </span>
                ) : null}
                {type === "income" && row.incomeOffsetTotal > 0 ? (
                  <span className="col-span-3 min-w-0 break-words pl-5 text-right text-xs text-slate-500 dark:text-slate-400">
                    Gross {formatMoney(row.grossIncomeTotal, currency)} | Offset{" "}
                    {formatMoney(-row.incomeOffsetTotal, currency)} | Net{" "}
                    {formatMoney(row.netIncomeTotal, currency)}
                  </span>
                ) : null}
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
