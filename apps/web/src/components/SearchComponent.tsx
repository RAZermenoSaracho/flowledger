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
  layout?: "responsive" | "compact";
};

export function SearchComponent({
  searchValue,
  searchLabel = "Search",
  searchPlaceholder,
  onSearchChange,
  filters = [],
  sort,
  archiveToggle,
  children,
  layout = "responsive"
}: SearchComponentProps) {
  const hasSearch = onSearchChange && searchValue !== undefined;

  return (
    <div className="w-full">
      <div
        className={
          layout === "compact"
            ? "flex w-full flex-col gap-3"
            : "flex w-full flex-wrap items-end gap-3"
        }
      >
        {hasSearch ? (
          <div className={layout === "compact" ? "w-full" : "min-w-56 flex-1"}>
            <TextInput
              label={searchLabel}
              value={searchValue}
              placeholder={searchPlaceholder}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        ) : null}

        {filters.map((filter) => (
          <div
            key={filter.id}
            className={layout === "compact" ? "w-full" : "min-w-44 flex-1"}
          >
            <SelectField
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
          </div>
        ))}

        {sort ? (
          <div
            className={
              layout === "compact"
                ? "grid w-full grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
                : "grid min-w-56 flex-1 grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
            }
          >
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
              aria-label={`Sort ${
                sort.direction === "asc" ? "ascending" : "descending"
              }`}
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
          <div className={layout === "compact" ? "w-full" : "min-w-56 flex-1"}>
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
          </div>
        ) : null}
      </div>

      {children ? <div className="mt-3 grid gap-3">{children}</div> : null}
    </div>
  );
}
