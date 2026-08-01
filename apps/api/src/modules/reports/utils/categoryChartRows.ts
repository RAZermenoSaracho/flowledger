const CHART_COLORS = [
  "#176b52",
  "#f97359",
  "#2563eb",
  "#ca8a04",
  "#7c3aed",
  "#0f766e",
  "#be185d",
  "#475569"
];

export type CategoryReportRow = {
  categoryId: string | null;
  categoryName: string;
  categoryType: "income" | "expense" | null;
  categoryColor: string | null;
  type: "income" | "expense";
  total: number;
  grossIncomeTotal: number;
  incomeOffsetTotal: number;
  netIncomeTotal: number;
  grossExpenseTotal: number;
  reimbursementTotal: number;
  netExpenseTotal: number;
};

export type ReportAmountMode = "net" | "gross";

function categoryDisplayTotal(
  row: CategoryReportRow,
  type: "income" | "expense",
  amountMode: ReportAmountMode
) {
  if (type === "expense") {
    return amountMode === "gross" ? row.grossExpenseTotal : row.total;
  }

  return amountMode === "gross" ? row.grossIncomeTotal : row.netIncomeTotal;
}

export function prepareCategoryChartRows(
  rows: CategoryReportRow[],
  type: "income" | "expense",
  amountMode: ReportAmountMode
) {
  return rows
    .filter((row) => {
      if (row.type !== type) return false;
      if (type === "expense") {
        if (amountMode === "gross") return row.grossExpenseTotal > 0;
        return row.grossExpenseTotal > 0 || row.reimbursementTotal > 0;
      }
      if (amountMode === "gross") {
        return row.grossIncomeTotal > 0;
      }
      return row.netIncomeTotal > 0;
    })
    .map((row, index) => {
      const categoryMismatch = row.categoryType && row.categoryType !== row.type;
      const displayName = categoryMismatch
        ? `${row.categoryName} (${row.categoryType} category)`
        : row.categoryName;
      const displayTotal = categoryDisplayTotal(row, type, amountMode);

      return {
        ...row,
        displayName,
        displayTotal,
        chartTotal: type === "expense" ? Math.max(displayTotal, 0) : displayTotal,
        fill:
          row.categoryColor ??
          CHART_COLORS[index % CHART_COLORS.length] ??
          "#64748b"
      };
    })
    .sort((a, b) => b.displayTotal - a.displayTotal);
}
