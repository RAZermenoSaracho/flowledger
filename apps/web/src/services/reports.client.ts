import { apiRequest } from "./api.client";
import type {
  CashflowRow,
  CategoryChartRow,
  Summary
} from "../types/reports.types";

export type ReportQuery = {
  dateFrom?: string;
  dateTo?: string;
  groupIds?: string[];
  categoryIds?: string[];
  currency?: string;
  amountMode?: "net" | "gross";
};

export function getSummaryReport(query: ReportQuery) {
  return apiRequest<{ summary: Summary; currency: string }>(
    "/reports/summary",
    { query }
  );
}

export function getByCategoryReport(query: ReportQuery) {
  return apiRequest<{
    expenseCategories: CategoryChartRow[];
    incomeCategories: CategoryChartRow[];
    currency: string;
  }>("/reports/by-category", { query });
}

export function getMonthlyCashflowReport(query: ReportQuery) {
  return apiRequest<{ cashflow: CashflowRow[]; currency: string }>(
    "/reports/monthly-cashflow",
    { query }
  );
}
