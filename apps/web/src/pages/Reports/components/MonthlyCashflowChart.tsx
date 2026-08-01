import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card } from "../../../components/Card";
import type { CashflowRow } from "../../../types/api";
import { formatCompactMoney, formatMoney } from "../../../utils/currency";

export function MonthlyCashflowChart({
  rows,
  currency,
  reportModeLabel
}: {
  rows: CashflowRow[];
  currency: string;
  reportModeLabel: string;
}) {
  return (
    <Card className="min-w-0">
      <h2 className="text-lg font-semibold">Monthly cashflow</h2>
      <div className="mt-4 h-80 min-w-0 overflow-hidden sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 12, right: 8, bottom: 8, left: 0 }}>
            <XAxis dataKey="month" tick={{ fontSize: 12 }} tickMargin={8} />
            <YAxis
              tickFormatter={(value) =>
                formatCompactMoney(Number(value), currency)
              }
              tick={{ fontSize: 12 }}
              width={64}
            />
            <Tooltip formatter={(value) => formatMoney(Number(value), currency)} />
            <Bar
              dataKey="reportIncome"
              name="Income"
              fill="#176b52"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="reportExpenses"
              name={`${reportModeLabel} expenses`}
              fill="#f97359"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
