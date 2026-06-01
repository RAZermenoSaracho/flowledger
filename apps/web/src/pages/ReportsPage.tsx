import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Search } from "lucide-react";
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
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { TextInput } from "../components/FormField";
import { apiRequest } from "../services/api";
import type {
  CashflowRow,
  Category,
  CategoryReportRow,
  Group,
  Summary
} from "../types/api";

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
  chartTotal: number;
  displayTotal: number;
};

type ReportAmountMode = "net" | "gross";
type ReportFilters = {
  dateFrom: string;
  dateTo: string;
  groupIds: string[];
  categoryIds: string[];
};

const reportAmountModes: { value: ReportAmountMode; label: string }[] = [
  { value: "net", label: "Net" },
  { value: "gross", label: "Gross" }
];
const emptyFilters: ReportFilters = {
  dateFrom: "",
  dateTo: "",
  groupIds: [],
  categoryIds: []
};

export function ReportsPage() {
  const [reportAmountMode, setReportAmountMode] =
    useState<ReportAmountMode>("net");
  const [filters, setFilters] = useState<ReportFilters>(emptyFilters);
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () =>
      (await apiRequest<{ categories: Category[] }>("/categories")).categories
  });
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: async () =>
      (await apiRequest<{ groups: Group[] }>("/groups")).groups
  });
  const summaryQuery = useQuery({
    queryKey: ["summary", filters],
    queryFn: async () =>
      (
        await apiRequest<{ summary: Summary }>("/reports/summary", {
          query: filters
        })
      ).summary
  });
  const categoryQuery = useQuery({
    queryKey: ["category-report", filters],
    queryFn: async () =>
      (
        await apiRequest<{ categories: CategoryReportRow[] }>(
          "/reports/by-category",
          { query: filters }
        )
      ).categories
  });
  const cashflowQuery = useQuery({
    queryKey: ["cashflow", filters],
    queryFn: async () =>
      (
        await apiRequest<{ cashflow: CashflowRow[] }>(
          "/reports/monthly-cashflow",
          { query: filters }
        )
      ).cashflow
  });
  const groups = groupsQuery.data ?? [];
  const personalCategories = categoriesQuery.data ?? [];
  const allCategoriesById = new Map<string, Category>();
  for (const category of personalCategories) {
    allCategoriesById.set(category.id, category);
  }
  for (const group of groups) {
    for (const category of group.categories) {
      allCategoriesById.set(category.id, category);
    }
  }
  const allCategories = [...allCategoriesById.values()];
  const selectedGroupIds = new Set(filters.groupIds);
  const categoryOptions = filters.groupIds.length
    ? groups
        .filter((group) => selectedGroupIds.has(group.id))
        .flatMap((group) => group.categories)
    : allCategories;
  const availableCategoryIds = new Set(
    categoryOptions.map((category) => category.id)
  );
  const hasActiveFilters =
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    filters.groupIds.length > 0 ||
    filters.categoryIds.length > 0;
  const categories = categoryQuery.data ?? [];
  const expenseCategories = prepareCategoryRows(
    categories,
    "expense",
    reportAmountMode
  );
  const incomeCategories = prepareCategoryRows(
    categories,
    "income",
    reportAmountMode
  );
  const summary = summaryQuery.data;
  const totalExpenses =
    reportAmountMode === "gross"
      ? (summary?.totalGrossExpenses ?? 0)
      : (summary?.totalNetExpenses ?? 0);
  const totalIncome =
    reportAmountMode === "gross"
      ? (summary?.totalGrossIncome ?? summary?.totalIncome ?? 0)
      : (summary?.totalNetIncome ?? summary?.totalIncome ?? 0);
  const reportBalance = totalIncome - totalExpenses;
  const cashflowRows = (cashflowQuery.data ?? []).map((row) => {
    const income =
      reportAmountMode === "gross"
        ? (row.grossIncome ?? row.income)
        : (row.netIncome ?? row.income - row.expenseReimbursements);
    const expenses =
      reportAmountMode === "gross" ? row.grossExpenses : row.netExpenses;

    return {
      ...row,
      reportIncome: income,
      reportExpenses: expenses
    };
  });
  const reportModeLabel = reportAmountMode === "gross" ? "Gross" : "Net";
  const setGroupIds = (groupIds: string[]) => {
    const nextCategoryIds = groupIds.length
      ? filters.categoryIds.filter((categoryId) =>
          groups
            .filter((group) => groupIds.includes(group.id))
            .some((group) =>
              group.categories.some((category) => category.id === categoryId)
            )
        )
      : filters.categoryIds;

    setFilters({ ...filters, groupIds, categoryIds: nextCategoryIds });
  };
  const setCategoryIds = (categoryIds: string[]) => {
    setFilters({
      ...filters,
      categoryIds: categoryIds.filter((categoryId) =>
        availableCategoryIds.has(categoryId)
      )
    });
  };

  return (
    <div className="grid gap-6">
      <Card>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <TextInput
              label="From"
              type="date"
              value={filters.dateFrom}
              onChange={(event) =>
                setFilters({ ...filters, dateFrom: event.target.value })
              }
            />
            <TextInput
              label="To"
              type="date"
              value={filters.dateTo}
              onChange={(event) =>
                setFilters({ ...filters, dateTo: event.target.value })
              }
            />
            <MultiSelectFilter
              label="Groups"
              options={groups.map((group) => ({
                id: group.id,
                label: group.name
              }))}
              selectedIds={filters.groupIds}
              allLabel="All groups"
              emptyText="No groups yet."
              onChange={setGroupIds}
            />
            <MultiSelectFilter
              label="Categories"
              options={categoryOptions.map((category) => ({
                id: category.id,
                label: category.name
              }))}
              selectedIds={filters.categoryIds}
              allLabel="All categories"
              emptyText="No categories yet."
              onChange={setCategoryIds}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:items-end">
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => setFilters(emptyFilters)}
              >
                Reset filters
              </Button>
            ) : null}
            <div className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              <span>Report amount</span>
              <div
                className="grid grid-cols-2 overflow-hidden rounded-md ring-1 ring-slate-200 dark:ring-slate-700"
                role="group"
                aria-label="Report amount basis"
              >
                {reportAmountModes.map((mode) => {
                  const isSelected = reportAmountMode === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      className={`min-h-10 px-4 py-2 text-sm font-semibold transition ${
                        isSelected
                          ? "bg-pine text-white dark:bg-emerald-700"
                          : "bg-white text-ink hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                      }`}
                      aria-pressed={isSelected}
                      onClick={() => setReportAmountMode(mode.value)}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="min-w-0">
          <p className="text-sm text-slate-500 dark:text-slate-400">Income</p>
          <p className="mt-2 break-words text-xl font-bold text-pine dark:text-emerald-300 sm:text-2xl">
            {money.format(totalIncome)}
          </p>
          {(summaryQuery.data?.totalExpenseReimbursements ?? 0) > 0 ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Gross {money.format(summaryQuery.data?.totalGrossIncome ?? 0)} |
              Offset{" "}
              {money.format(
                -(summaryQuery.data?.totalExpenseReimbursements ?? 0)
              )}
            </p>
          ) : null}
        </Card>
        <Card className="min-w-0">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {reportModeLabel} expenses
          </p>
          <p className="mt-2 break-words text-xl font-bold text-coral dark:text-orange-300 sm:text-2xl">
            {money.format(totalExpenses)}
          </p>
          {(summaryQuery.data?.totalExpenseReimbursements ?? 0) > 0 ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Gross {money.format(summaryQuery.data?.totalGrossExpenses ?? 0)} |
              Offset{" "}
              {money.format(
                -(summaryQuery.data?.totalExpenseReimbursements ?? 0)
              )}
            </p>
          ) : null}
        </Card>
        <Card className="min-w-0">
          <p className="text-sm text-slate-500 dark:text-slate-400">Balance</p>
          <p className="mt-2 break-words text-xl font-bold sm:text-2xl">
            {money.format(reportBalance)}
          </p>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <CategoryBreakdown
          title="Expenses by category"
          rows={expenseCategories}
          emptyText="No expense categories yet."
          type="expense"
        />
        <CategoryBreakdown
          title="Income by category"
          rows={incomeCategories}
          emptyText="No income categories yet."
          type="income"
        />
      </section>

      <Card className="min-w-0">
        <h2 className="text-lg font-semibold">Monthly cashflow</h2>
        <div className="mt-4 h-80 min-w-0 overflow-hidden sm:h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={cashflowRows}
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
    </div>
  );
}

function MultiSelectFilter({
  label,
  options,
  selectedIds,
  allLabel,
  emptyText,
  onChange
}: {
  label: string;
  options: { id: string; label: string }[];
  selectedIds: string[];
  allLabel: string;
  emptyText: string;
  onChange: (selectedIds: string[]) => void;
}) {
  const fieldId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const optionIds = useMemo(() => options.map((option) => option.id), [options]);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(query)
    );
  }, [options, search]);
  const selectedOptionCount = selectedIds.filter((id) =>
    optionIds.includes(id)
  ).length;
  const selectionLabel = !options.length
    ? emptyText
    : selectedOptionCount
      ? `${selectedOptionCount} selected`
      : allLabel;
  const selectionTitle =
    selectedOptionCount === 1
      ? options.find((option) => selectedIds.includes(option.id))?.label
      : selectionLabel;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const toggleOption = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id]
    );
  };

  return (
    <div ref={containerRef} className="relative grid min-w-0 gap-1 text-sm">
      <span
        id={`${fieldId}-label`}
        className="font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
      </span>
      <button
        type="button"
        className="flex min-h-10 w-full min-w-0 items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-ink outline-none transition hover:bg-slate-50 focus:border-pine focus:ring-2 focus:ring-mint disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900 dark:focus:ring-emerald-900"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={`${fieldId}-label ${fieldId}-value`}
        disabled={!options.length}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span
          id={`${fieldId}-value`}
          className="min-w-0 truncate"
          title={selectionTitle}
        >
          {selectionLabel}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 min-w-64 rounded-md border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-500 focus-within:border-pine focus-within:ring-2 focus-within:ring-mint dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:focus-within:ring-emerald-900">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-slate-400 dark:text-slate-100"
              type="search"
              placeholder={`Search ${label.toLowerCase()}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-slate-500 dark:text-slate-400">
              {selectionLabel}
            </span>
            <div className="flex shrink-0 gap-3">
              <button
                type="button"
                className="font-semibold text-pine hover:underline disabled:text-slate-300 dark:text-emerald-300 dark:disabled:text-slate-700"
                onClick={() => onChange(optionIds)}
                disabled={!options.length}
              >
                Select all
              </button>
              <button
                type="button"
                className="font-semibold text-slate-500 hover:underline disabled:text-slate-300 dark:text-slate-400 dark:disabled:text-slate-700"
                onClick={() => onChange([])}
                disabled={!selectedOptionCount}
              >
                Clear
              </button>
            </div>
          </div>

          <div
            className="mt-3 max-h-56 min-w-0 overflow-y-auto pr-1"
            role="listbox"
            aria-multiselectable="true"
            aria-labelledby={`${fieldId}-label`}
          >
            {filteredOptions.length ? (
              <div className="grid min-w-0 gap-1">
                {filteredOptions.map((option) => (
                  <label
                    key={option.id}
                    className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-pine focus:ring-pine dark:border-slate-600 dark:bg-slate-950"
                      checked={selectedIds.includes(option.id)}
                      onChange={() => toggleOption(option.id)}
                    />
                    <span className="min-w-0 truncate" title={option.label}>
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="px-2 py-2 text-sm text-slate-500 dark:text-slate-400">
                {options.length ? "No matches found." : emptyText}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CategoryBreakdown({
  title,
  rows,
  emptyText,
  type
}: {
  title: string;
  rows: CategoryChartRow[];
  emptyText: string;
  type: "income" | "expense";
}) {
  const total = rows.reduce((sum, row) => sum + row.displayTotal, 0);
  const chartRows = rows.filter((row) => row.chartTotal > 0);

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
                  {money.format(row.displayTotal)}
                </span>
                {type === "expense" && row.reimbursementTotal > 0 ? (
                  <span className="col-span-3 min-w-0 break-words pl-5 text-right text-xs text-slate-500 dark:text-slate-400">
                    Gross {money.format(row.grossExpenseTotal)} | Offset{" "}
                    {money.format(-row.reimbursementTotal)} | Net{" "}
                    {money.format(row.netExpenseTotal)}
                  </span>
                ) : null}
                {type === "income" && row.incomeOffsetTotal > 0 ? (
                  <span className="col-span-3 min-w-0 break-words pl-5 text-right text-xs text-slate-500 dark:text-slate-400">
                    Gross {money.format(row.grossIncomeTotal)} | Offset{" "}
                    {money.format(-row.incomeOffsetTotal)} | Net{" "}
                    {money.format(row.netIncomeTotal)}
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

function prepareCategoryRows(
  rows: CategoryReportRow[],
  type: "income" | "expense",
  reportAmountMode: ReportAmountMode = "net"
): CategoryChartRow[] {
  return rows
    .filter((row) => {
      if (row.type !== type) return false;
      if (type === "expense") {
        if (reportAmountMode === "gross") return row.grossExpenseTotal > 0;
        return row.grossExpenseTotal > 0 || row.reimbursementTotal > 0;
      }
      if (reportAmountMode === "gross") {
        return (row.grossIncomeTotal ?? row.total) > 0;
      }
      return (row.netIncomeTotal ?? row.total) > 0;
    })
    .map((row, index) => {
      const categoryMismatch =
        row.categoryType && row.categoryType !== row.type;
      const displayName = categoryMismatch
        ? `${row.categoryName} (${row.categoryType} category)`
        : row.categoryName;
      const displayTotal = getCategoryDisplayTotal(row, type, reportAmountMode);

      return {
        ...row,
        displayName,
        displayTotal,
        chartTotal:
          type === "expense" ? Math.max(displayTotal, 0) : displayTotal,
        fill: row.categoryColor ?? colors[index % colors.length] ?? "#64748b"
      };
    })
    .sort((a, b) => b.displayTotal - a.displayTotal);
}

function getCategoryDisplayTotal(
  row: CategoryReportRow,
  type: "income" | "expense",
  reportAmountMode: ReportAmountMode
) {
  if (type === "expense") {
    return reportAmountMode === "gross" ? row.grossExpenseTotal : row.total;
  }

  return reportAmountMode === "gross"
    ? (row.grossIncomeTotal ?? row.total)
    : (row.netIncomeTotal ?? row.total);
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
