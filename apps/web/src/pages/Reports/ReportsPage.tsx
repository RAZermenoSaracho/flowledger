import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../hooks/useAuth";
import { listCategories } from "../../services/categories.client";
import { listGroups } from "../../services/groups.client";
import * as reportsClient from "../../services/reports.client";
import { CategoryBreakdown } from "./components/CategoryBreakdown";
import { MonthlyCashflowChart } from "./components/MonthlyCashflowChart";
import {
  emptyReportFilters,
  ReportFiltersCard
} from "./components/ReportFiltersCard";
import type {
  ReportAmountMode,
  ReportFilters
} from "./components/ReportFiltersCard";
import { ReportSummaryCards } from "./components/ReportSummaryCards";

export function ReportsPage() {
  const auth = useAuth();
  const [reportAmountMode, setReportAmountMode] =
    useState<ReportAmountMode>("net");
  const [filters, setFilters] = useState<ReportFilters>(emptyReportFilters);
  const [currency, setCurrency] = useState(
    auth.user?.preferredCurrency || "USD"
  );
  const reportQuery = { ...filters, currency, amountMode: reportAmountMode };
  const allCategoriesQuery = useQuery({
    queryKey: ["categories", "all"],
    queryFn: async () => (await listCategories({ scope: "all" })).categories
  });
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: async () => (await listGroups()).groups
  });
  const summaryQuery = useQuery({
    queryKey: ["summary", reportQuery],
    queryFn: async () => (await reportsClient.getSummaryReport(reportQuery)).summary
  });
  const categoryQuery = useQuery({
    queryKey: ["category-report", reportQuery],
    queryFn: async () => reportsClient.getByCategoryReport(reportQuery)
  });
  const cashflowQuery = useQuery({
    queryKey: ["cashflow", reportQuery],
    queryFn: async () =>
      (await reportsClient.getMonthlyCashflowReport(reportQuery)).cashflow
  });
  const groups = groupsQuery.data ?? [];
  const allCategories = allCategoriesQuery.data ?? [];
  const selectedGroupIds = new Set(filters.groupIds);
  const categoryOptions = filters.groupIds.length
    ? groups
        .filter((group) => selectedGroupIds.has(group.id))
        .flatMap((group) => group.categories)
    : allCategories;
  const hasActiveFilters =
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    filters.groupIds.length > 0 ||
    filters.categoryIds.length > 0;
  const expenseCategories = categoryQuery.data?.expenseCategories ?? [];
  const incomeCategories = categoryQuery.data?.incomeCategories ?? [];
  const summary = summaryQuery.data;
  const totalIncome = summary?.reportIncome ?? 0;
  const totalExpenses = summary?.reportExpenses ?? 0;
  const reportBalance = summary?.reportBalance ?? 0;
  const cashflowRows = cashflowQuery.data ?? [];
  const reportModeLabel = reportAmountMode === "gross" ? "Gross" : "Net";

  return (
    <div className="grid gap-6">
      <ReportFiltersCard
        filters={filters}
        onFiltersChange={setFilters}
        groups={groups}
        categoryOptions={categoryOptions}
        hasActiveFilters={hasActiveFilters}
        currency={currency}
        onCurrencyChange={setCurrency}
        reportAmountMode={reportAmountMode}
        onReportAmountModeChange={setReportAmountMode}
      />

      <ReportSummaryCards
        currency={currency}
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        reportBalance={reportBalance}
        reportModeLabel={reportModeLabel}
        totalGrossIncome={summary?.totalGrossIncome ?? 0}
        totalGrossExpenses={summary?.totalGrossExpenses ?? 0}
        totalExpenseReimbursements={summary?.totalExpenseReimbursements ?? 0}
      />

      <section className="grid gap-6 xl:grid-cols-2">
        <CategoryBreakdown
          title="Expenses by category"
          rows={expenseCategories}
          emptyText="No expense categories yet."
          type="expense"
          currency={currency}
        />
        <CategoryBreakdown
          title="Income by category"
          rows={incomeCategories}
          emptyText="No income categories yet."
          type="income"
          currency={currency}
        />
      </section>

      <MonthlyCashflowChart
        rows={cashflowRows}
        currency={currency}
        reportModeLabel={reportModeLabel}
      />
    </div>
  );
}
