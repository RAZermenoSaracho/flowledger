import type { FinancialOverview } from "@flowledger/shared";
import { apiRequest } from "./api.client";
import type {
  CashflowRow,
  CategoryChartRow,
  Summary
} from "../types/reports.types";

/** Date/group/category/currency filter params shared by all report endpoints. */
export type ReportQuery = {
  dateFrom?: string;
  dateTo?: string;
  groupIds?: string[];
  categoryIds?: string[];
  currency?: string;
  amountMode?: "net" | "gross";
};

/** Fetches income/expense summary totals. */
export function getSummaryReport(query: ReportQuery) {
  return apiRequest<{ summary: Summary; currency: string }>(
    "/reports/summary",
    { query }
  );
}

/** Fetches per-category report rows, split into expense and income categories. */
export function getByCategoryReport(query: ReportQuery) {
  return apiRequest<{
    expenseCategories: CategoryChartRow[];
    incomeCategories: CategoryChartRow[];
    currency: string;
  }>("/reports/by-category", { query });
}

/** Fetches monthly cashflow rows, bucketed by the device's timezone. */
export function getMonthlyCashflowReport(query: ReportQuery) {
  return apiRequest<{ cashflow: CashflowRow[]; currency: string }>(
    "/reports/monthly-cashflow",
    { query: { ...query, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } }
  );
}

/** Fetches estimated net worth and last-month savings rate, using the device's timezone to pick the month. */
export function getFinancialOverview() {
  return apiRequest<FinancialOverview>("/reports/financial-overview", {
    query: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
  });
}
