import type { Prisma } from "@prisma/client";

/** Per-category totals for one report period, in the report's target currency. */
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

/** Whether a report displays gross totals or totals net of offsets/reimbursements. */
export type ReportAmountMode = "net" | "gross";

/** Shape of a `Prisma.transaction.groupBy` row summed by execution currency, as consumed by currency-conversion aggregation. */
export type CurrencyGroupedSum = {
  _sum: { amount: import("@prisma/client").Prisma.Decimal | null };
  executionCurrency: string;
};
