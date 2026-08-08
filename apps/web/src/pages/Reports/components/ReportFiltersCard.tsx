import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { CurrencySelect } from "../../../components/CurrencySelect";
import { TextInput } from "../../../components/FormField";
import type { Category } from "../../../types/categories.types";
import type { Group } from "../../../types/groups.types";
import type { ReportAmountMode, ReportFilters } from "../types/reports.types";
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

/** Date range, group, and category filter controls for reports. */
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

  return (
    <Card>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <TextInput
            label="From"
            type="date"
            value={filters.dateFrom}
            onChange={(event) =>
              onFiltersChange({ ...filters, dateFrom: event.target.value })
            }
          />
          <TextInput
            label="To"
            type="date"
            value={filters.dateTo}
            onChange={(event) =>
              onFiltersChange({ ...filters, dateTo: event.target.value })
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
              onClick={() => onFiltersChange(emptyReportFilters)}
            >
              Reset filters
            </Button>
          ) : null}
          <div className="min-w-44">
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
      </div>
    </Card>
  );
}
