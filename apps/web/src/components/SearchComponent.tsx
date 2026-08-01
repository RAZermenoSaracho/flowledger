import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { SelectField } from "./FormField";

export type SearchFacetOption = {
  label: string;
  value: string;
};

export type SearchFacetDef = {
  id: string;
  label: string;
  options: SearchFacetOption[];
};

export type SearchGroupByDef = {
  id: string;
  label: string;
};

export type SearchFilterOption = SearchFacetOption;

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
  facets?: SearchFacetDef[];
  activeFacetValues?: Record<string, string[]>;
  onFacetValuesChange?: (facetId: string, values: string[]) => void;
  groupBys?: SearchGroupByDef[];
  activeGroupBys?: string[];
  onGroupBysChange?: (groupByIds: string[]) => void;
  sort?: SearchSort;
  archiveToggle?: SearchArchiveToggle;
  children?: ReactNode;
  layout?: "responsive" | "compact";
};

type Suggestion = {
  facetId: string;
  facetLabel: string;
  option: SearchFacetOption;
};

export function SearchComponent({
  searchValue,
  searchLabel = "Search",
  searchPlaceholder,
  onSearchChange,
  facets = [],
  activeFacetValues = {},
  onFacetValuesChange,
  groupBys = [],
  activeGroupBys = [],
  onGroupBysChange,
  sort,
  archiveToggle,
  children,
  layout = "responsive"
}: SearchComponentProps) {
  const hasSearch = onSearchChange && searchValue !== undefined;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openFacetId, setOpenFacetId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
        setOpenFacetId(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        setOpenFacetId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const query = searchValue?.trim().toLowerCase();
    if (!query || !onFacetValuesChange) return [];

    const matches: Suggestion[] = [];
    for (const facet of facets) {
      for (const option of facet.options) {
        if (option.label.toLowerCase().includes(query)) {
          matches.push({ facetId: facet.id, facetLabel: facet.label, option });
        }
        if (matches.length >= 5) break;
      }
      if (matches.length >= 5) break;
    }
    return matches;
  }, [facets, onFacetValuesChange, searchValue]);

  function setFacetValues(facetId: string, values: string[]) {
    onFacetValuesChange?.(facetId, values);
  }

  function toggleFacetValue(facetId: string, value: string) {
    const current = activeFacetValues[facetId] ?? [];
    setFacetValues(
      facetId,
      current.includes(value)
        ? current.filter((existing) => existing !== value)
        : [...current, value]
    );
  }

  function toggleGroupBy(groupById: string) {
    onGroupBysChange?.(
      activeGroupBys.includes(groupById)
        ? activeGroupBys.filter((id) => id !== groupById)
        : [...activeGroupBys, groupById]
    );
  }

  function applySuggestion(suggestion: Suggestion) {
    toggleFacetValue(suggestion.facetId, suggestion.option.value);
    onSearchChange?.("");
  }

  const activeFacetPills = facets
    .map((facet) => ({
      facet,
      values: activeFacetValues[facet.id] ?? []
    }))
    .filter(({ values }) => values.length > 0);

  return (
    <div className="w-full">
      <div
        className={`flex w-full flex-col gap-3 ${
          layout === "compact" ? "" : "lg:flex-row lg:items-start"
        }`}
      >
        <div ref={containerRef} className="relative min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 focus-within:border-pine focus-within:ring-2 focus-within:ring-mint dark:border-slate-700 dark:bg-slate-950 dark:focus-within:ring-emerald-900">
            <Search
              className="h-4 w-4 shrink-0 text-slate-400"
              aria-hidden="true"
            />

            {activeFacetPills.map(({ facet, values }) => (
              <FacetPill
                key={facet.id}
                label={facet.label}
                text={values
                  .map(
                    (value) =>
                      facet.options.find((option) => option.value === value)
                        ?.label ?? value
                  )
                  .join(" or ")}
                onRemove={() => setFacetValues(facet.id, [])}
              />
            ))}

            {activeGroupBys.map((groupById) => {
              const groupBy = groupBys.find((item) => item.id === groupById);
              if (!groupBy) return null;
              return (
                <FacetPill
                  key={`group-${groupById}`}
                  label="Group by"
                  text={groupBy.label}
                  onRemove={() => toggleGroupBy(groupById)}
                />
              );
            })}

            {hasSearch ? (
              <input
                className="min-w-32 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-slate-400 dark:text-slate-100"
                type="search"
                aria-label={searchLabel}
                placeholder={
                  activeFacetPills.length === 0 && activeGroupBys.length === 0
                    ? (searchPlaceholder ?? searchLabel)
                    : ""
                }
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            ) : (
              <span className="flex-1" />
            )}

            {facets.length > 0 || groupBys.length > 0 ? (
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                aria-label="Filters and Group By"
                onClick={() => setIsMenuOpen((current) => !current)}
              >
                <ChevronDown
                  className={`h-4 w-4 transition ${isMenuOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
            ) : null}
          </div>

          {suggestions.length > 0 ? (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.facetId}:${suggestion.option.value}`}
                  type="button"
                  className="block w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => applySuggestion(suggestion)}
                >
                  <span className="font-semibold">
                    {suggestion.facetLabel}:
                  </span>{" "}
                  {suggestion.option.label}
                </button>
              ))}
            </div>
          ) : null}

          {isMenuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-2 grid w-72 gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            >
              {facets.length > 0 ? (
                <div>
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Filters
                  </p>
                  <div className="mt-1 grid gap-0.5">
                    {facets.map((facet) => {
                      const selectedValues = activeFacetValues[facet.id] ?? [];
                      const isOpenFacet = openFacetId === facet.id;
                      return (
                        <div key={facet.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm font-medium text-ink hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                            onClick={() =>
                              setOpenFacetId(isOpenFacet ? null : facet.id)
                            }
                          >
                            <span>
                              {facet.label}
                              {selectedValues.length > 0
                                ? ` (${selectedValues.length})`
                                : ""}
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 text-slate-400 transition ${
                                isOpenFacet ? "rotate-180" : ""
                              }`}
                              aria-hidden="true"
                            />
                          </button>
                          {isOpenFacet ? (
                            <div className="ml-2 grid gap-0.5 border-l border-slate-200 pl-2 dark:border-slate-700">
                              {facet.options.map((option) => (
                                <label
                                  key={option.value}
                                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300 text-pine focus:ring-pine dark:border-slate-600 dark:bg-slate-950"
                                    checked={selectedValues.includes(
                                      option.value
                                    )}
                                    onChange={() =>
                                      toggleFacetValue(facet.id, option.value)
                                    }
                                  />
                                  {option.label}
                                </label>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {groupBys.length > 0 ? (
                <div>
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Group By
                  </p>
                  <div className="mt-1 grid gap-0.5">
                    {groupBys.map((groupBy) => (
                      <label
                        key={groupBy.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-pine focus:ring-pine dark:border-slate-600 dark:bg-slate-950"
                          checked={activeGroupBys.includes(groupBy.id)}
                          onChange={() => toggleGroupBy(groupBy.id)}
                        />
                        {groupBy.label}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {sort ? (
          <div
            className={`grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 ${
              layout === "compact" ? "" : "lg:w-72 lg:shrink-0"
            }`}
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
              aria-label={`Sort ${sort.direction === "asc" ? "ascending" : "descending"}`}
              onClick={() =>
                sort.onDirectionChange(sort.direction === "asc" ? "desc" : "asc")
              }
            >
              {sort.direction === "asc" ? "Asc" : "Desc"}
            </Button>
          </div>
        ) : null}

        {archiveToggle ? (
          <div
            className={`grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-300 ${
              layout === "compact" ? "" : "lg:w-56 lg:shrink-0"
            }`}
          >
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

      {children ? <div className="mt-3 grid gap-3">{children}</div> : null}
    </div>
  );
}

function FacetPill({
  label,
  text,
  onRemove
}: {
  label: string;
  text: string;
  onRemove: () => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-xs font-semibold text-pine dark:bg-emerald-950 dark:text-emerald-200">
      <span className="max-w-48 truncate" title={`${label}: ${text}`}>
        {label}: {text}
      </span>
      <button
        type="button"
        className="rounded-full text-pine/70 hover:text-pine dark:text-emerald-300/70 dark:hover:text-emerald-200"
        aria-label={`Remove ${label} filter`}
        onClick={onRemove}
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}

// Groups a filtered list by the active group-by ids (in selection order),
// returning ordered sections with header labels. A single flat section is
// returned when no group-bys are active.
export function groupByFields<T>(
  items: T[],
  activeGroupByIds: string[],
  groupBys: SearchGroupByDef[],
  keyOf: (item: T, groupById: string) => { key: string; label: string }
): { key: string; label: string; items: T[] }[] {
  if (activeGroupByIds.length === 0 || items.length === 0) {
    return [{ key: "", label: "", items }];
  }

  const buckets = new Map<string, { label: string; items: T[] }>();
  for (const item of items) {
    const parts = activeGroupByIds
      .filter((id) => groupBys.some((groupBy) => groupBy.id === id))
      .map((id) => keyOf(item, id));
    const key = parts.map((part) => part.key).join(" / ");
    const label = parts.map((part) => part.label).join(" / ");
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.items.push(item);
    } else {
      buckets.set(key, { label, items: [item] });
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { label, items: bucketItems }]) => ({
      key,
      label,
      items: bucketItems
    }));
}
