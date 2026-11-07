import { SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { DateTimeFilterInput } from "../../../components/DateTimeFilterInput";
import { CurrencySelect } from "../../../components/CurrencySelect";
import type { Category } from "../../../types/categories.types";
import type { Group } from "../../../types/groups.types";
import type { ReportAmountMode, ReportFilters } from "../types/reports.types";
import { formatFilterValue } from "../../../utils/dateTime";
import { MultiSelectFilter } from "./MultiSelectFilter";

/** Net/gross options for the report amount-mode toggle. */
export const reportAmountModes: { value: ReportAmountMode; label: string }[] = [
  { value: "net", label: "Net" },
  { value: "gross", label: "Gross" }
];
/** Default (empty) `ReportFilters` value. */
export const emptyReportFilters: ReportFilters = {
  dateFrom: "",
  dateTo: "",
  groupIds: [],
  categoryIds: []
};

/** Compact reports toolbar: a Filters popover (date range, groups, categories), a summary of what is active, and the currency and net/gross controls. */
export function ReportFiltersCard({
  filters,
  onFiltersChange,
  groups,
  categoryOptions,
  hasActiveFilters,
  currency,
  onCurrencyChange,
  reportAmountMode,
  onReportAmountModeChange
}: {
  filters: ReportFilters;
  onFiltersChange: (filters: ReportFilters) => void;
  groups: Group[];
  categoryOptions: Category[];
  hasActiveFilters: boolean;
  currency: string;
  onCurrencyChange: (currency: string) => void;
  reportAmountMode: ReportAmountMode;
  onReportAmountModeChange: (mode: ReportAmountMode) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      containerRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

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

    onFiltersChange({ ...filters, groupIds, categoryIds: nextCategoryIds });
  };
  const availableCategoryIds = new Set(
    categoryOptions.map((category) => category.id)
  );
  const setCategoryIds = (categoryIds: string[]) => {
    onFiltersChange({
      ...filters,
      categoryIds: categoryIds.filter((categoryId) =>
        availableCategoryIds.has(categoryId)
      )
    });
  };
  const summary = [
    filters.dateFrom && `From ${formatFilterValue(filters.dateFrom)}`,
    filters.dateTo && `To ${formatFilterValue(filters.dateTo)}`,
    filters.groupIds.length > 0 &&
      `${filters.groupIds.length} ${filters.groupIds.length === 1 ? "group" : "groups"}`,
    filters.categoryIds.length > 0 &&
      `${filters.categoryIds.length} ${filters.categoryIds.length === 1 ? "category" : "categories"}`
  ].filter(Boolean) as string[];

  return (
    <Card className="flex flex-wrap items-end gap-x-4 gap-y-3 p-3">
      <div ref={containerRef} className="relative">
        <Button
          type="button"
          variant="secondary"
          className="inline-flex items-center gap-2"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls="report-filters-panel"
          onClick={() => setIsOpen((current) => !current)}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters{hasActiveFilters ? " (active)" : ""}
        </Button>
        {isOpen ? (
          <div
            id="report-filters-panel"
            role="dialog"
            aria-label="Report filters"
            className="absolute left-0 top-full z-30 mt-2 grid w-[min(32rem,calc(100vw-4.5rem))] gap-4 rounded-md border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <DateTimeFilterInput
                label="From"
                value={filters.dateFrom}
                onChange={(next) => onFiltersChange({ ...filters, dateFrom: next })}
              />
              <DateTimeFilterInput
                label="To"
                value={filters.dateTo}
                defaultTime="23:59"
                onChange={(next) => onFiltersChange({ ...filters, dateTo: next })}
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
          </div>
        ) : null}
      </div>

      {hasActiveFilters ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 self-center">
          {summary.map((text) => (
            <span
              key={text}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {text}
            </span>
          ))}
          <button
            type="button"
            className="text-xs font-semibold text-pine hover:underline dark:text-emerald-300"
            onClick={() => onFiltersChange(emptyReportFilters)}
          >
            Reset filters
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 sm:ml-auto">
        <div className="w-36">
          <CurrencySelect
            label="Currency"
            value={currency}
            onChange={onCurrencyChange}
          />
        </div>
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
                  onClick={() => onReportAmountModeChange(mode.value)}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
