import type { ReactNode } from "react";
import { Button } from "./Button";
import { SelectField, TextInput } from "./FormField";

export type SearchFilterOption = {
  label: string;
  value: string;
};

export type SearchFilter = {
  id: string;
  label: string;
  value: string;
  options: SearchFilterOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
};

export type SearchSort = {
  label?: string;
  value: string;
  options: SearchFilterOption[];
  direction: "asc" | "desc";
  onChange: (value: string) => void;
  onDirectionChange: (direction: "asc" | "desc") => void;
};

export type SearchArchiveToggle = {
  value: "active" | "archived";
  onChange: (value: "active" | "archived") => void;
  activeLabel?: string;
  archivedLabel?: string;
};

type SearchComponentProps = {
  searchValue?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  filters?: SearchFilter[];
  sort?: SearchSort;
  archiveToggle?: SearchArchiveToggle;
  children?: ReactNode;
};

export function SearchComponent({
  searchValue,
  searchLabel = "Search",
  searchPlaceholder,
  onSearchChange,
  filters = [],
  sort,
  archiveToggle,
  children
}: SearchComponentProps) {
  const hasSearch = onSearchChange && searchValue !== undefined;

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
        {hasSearch ? (
          <TextInput
            label={searchLabel}
            value={searchValue}
            placeholder={searchPlaceholder}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        ) : null}
        {filters.map((filter) => (
          <SelectField
            key={filter.id}
            label={filter.label}
            value={filter.value}
            disabled={filter.disabled}
            onChange={(event) => filter.onChange(event.target.value)}
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        ))}
        {sort ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <SelectField
              label={sort.label ?? "Sort by"}
              value={sort.value}
              onChange={(event) => sort.onChange(event.target.value)}
            >
              {sort.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
            <Button
              type="button"
              variant="secondary"
              aria-label={`Sort ${sort.direction === "asc" ? "ascending" : "descending"}`}
              onClick={() =>
                sort.onDirectionChange(
                  sort.direction === "asc" ? "desc" : "asc"
                )
              }
            >
              {sort.direction === "asc" ? "Asc" : "Desc"}
            </Button>
          </div>
        ) : null}
        {archiveToggle ? (
          <div className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            <span>Status</span>
            <div className="grid grid-cols-2 overflow-hidden rounded-md ring-1 ring-slate-200 dark:ring-slate-700">
              {(["active", "archived"] as const).map((value) => {
                const isSelected = archiveToggle.value === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`min-h-10 px-3 py-2 text-sm font-semibold transition ${
                      isSelected
                        ? "bg-pine text-white dark:bg-emerald-700"
                        : "bg-white text-ink hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                    }`}
                    aria-pressed={isSelected}
                    onClick={() => archiveToggle.onChange(value)}
                  >
                    {value === "active"
                      ? (archiveToggle.activeLabel ?? "Active")
                      : (archiveToggle.archivedLabel ?? "Archived")}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      {children ? <div className="grid gap-3">{children}</div> : null}
    </div>
  );
}
