import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createConditionWithValue,
  domainToSummaryText,
  domainToWhere,
  createEmptyGroup,
  removeNode,
  type DomainGroupNode,
  type GroupableField,
  type Operator,
  type SearchFieldConfig,
  type SortDirection,
  type SortableField,
  type WhereNode
} from "../utils/searchDomain";
import { Button } from "./Button";
import { FilterBuilder } from "./FilterBuilder";
import { SelectField } from "./FormField";

/** Shape of the where/sort/groupBy state `<SearchBar>` produces. */
export type SearchBarQuery = {
  where?: WhereNode;
  sort?: { field: string; direction: SortDirection }[];
  /** Selected groupable field names — presentational bucketing for the
   * consumer to apply client-side, not a DSQL groupBy/aggregation. */
  groupBy?: string[];
};

// A quick-search term uses "contains" for string fields (that's the
// whole point of a free-text box — exact match would defeat it) and
// exact equality for every other type, where fuzzy matching doesn't
// apply the same way.
function defaultSearchOperator(field: SearchFieldConfig | undefined): Operator {
  return field?.type === "string" ? "ilike" : "=";
}

// Generic, model-agnostic searchbar: free-text box + an Odoo-style
// dropdown (Filter | Group | Sort). Filter opens <FilterBuilder>, a
// separate AND/OR condition-tree popup. Every field/operator/label comes
// from props — this file has no knowledge of any specific module's data
// model. See src/utils/searchDomain.ts for the query language these
// compile to.
export function SearchBar({
  fields,
  groupableFields = [],
  sortableFields = [],
  defaultSearchField,
  initialSort,
  placeholder = "Search",
  onQueryChange
}: {
  fields: SearchFieldConfig[];
  groupableFields?: GroupableField[];
  sortableFields?: SortableField[];
  /**
   * Real field name the free-text box targets. Pressing Enter adds an
   * ordinary condition on this field (not a distinct pseudo-field —
   * it's never injected into `fields` and never appears in
   * <FilterBuilder>'s field picker). Omit to hide the free-text box
   * entirely.
   */
  defaultSearchField?: string;
  initialSort?: { field: string; direction: SortDirection };
  placeholder?: string;
  onQueryChange: (query: SearchBarQuery) => void;
}) {
  const [domain, setDomain] = useState<DomainGroupNode>(() => createEmptyGroup("and"));
  const [groupBys, setGroupBys] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState(initialSort?.field ?? sortableFields[0]?.name ?? "");
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    initialSort?.direction ?? "desc"
  );
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isFilterBuilderOpen, setIsFilterBuilderOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPanelOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsPanelOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsPanelOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPanelOpen]);

  const query = useMemo<SearchBarQuery>(
    () => ({
      where: domainToWhere(domain, fields),
      sort: sortBy ? [{ field: sortBy, direction: sortDirection }] : undefined,
      groupBy: groupBys.length > 0 ? groupBys : undefined
    }),
    [domain, fields, sortBy, sortDirection, groupBys]
  );

  useEffect(() => {
    onQueryChange(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function toggleGroupBy(groupById: string) {
    setGroupBys((current) =>
      current.includes(groupById)
        ? current.filter((id) => id !== groupById)
        : [...current, groupById]
    );
  }

  function clearAll() {
    setDomain(createEmptyGroup("and"));
    setGroupBys([]);
    setSearchDraft("");
  }

  function commitSearchDraft() {
    const trimmed = searchDraft.trim();
    if (!trimmed || !defaultSearchField) return;

    const field = fields.find((entry) => entry.name === defaultSearchField);
    const condition = createConditionWithValue(
      defaultSearchField,
      defaultSearchOperator(field),
      trimmed
    );
    setDomain((current) => ({ ...current, children: [...current.children, condition] }));
    setSearchDraft("");
  }

  const activeConditionCount = useMemo(() => {
    let count = 0;
    function walk(node: DomainGroupNode) {
      for (const child of node.children) {
        if (child.type === "condition") count += 1;
        else walk(child);
      }
    }
    walk(domain);
    return count;
  }, [domain]);

  return (
    <div className="w-full">
      <div className="relative min-w-0" ref={containerRef}>
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 focus-within:border-pine focus-within:ring-2 focus-within:ring-mint dark:border-slate-700 dark:bg-slate-950 dark:focus-within:ring-emerald-900">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />

          {domain.children.map((child) => (
            <FilterPill
              key={child.id}
              text={domainToSummaryText(child, fields)}
              onRemove={() => setDomain(removeNode(domain, child.id))}
            />
          ))}

          {groupBys.map((groupById) => {
            const groupBy = groupableFields.find((entry) => entry.name === groupById);
            if (!groupBy) return null;
            return (
              <FilterPill
                key={`group-${groupById}`}
                text={`Group by ${groupBy.label}`}
                onRemove={() => toggleGroupBy(groupById)}
              />
            );
          })}

          {defaultSearchField ? (
            <input
              className="min-w-32 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-slate-400 dark:text-slate-100"
              type="search"
              aria-label={placeholder}
              placeholder={
                domain.children.length === 0 && groupBys.length === 0 ? placeholder : ""
              }
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitSearchDraft();
                }
              }}
            />
          ) : (
            <span className="flex-1" />
          )}

          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-haspopup="menu"
            aria-expanded={isPanelOpen}
            aria-label="Filter, group, and sort"
            onClick={() => setIsPanelOpen((current) => !current)}
          >
            <ChevronDown
              className={`h-4 w-4 transition ${isPanelOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>

        {isPanelOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-2 grid w-80 gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            <div>
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Filter
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-1 w-full"
                onClick={() => {
                  setIsFilterBuilderOpen(true);
                  setIsPanelOpen(false);
                }}
              >
                Edit filters
                {activeConditionCount > 0 ? " (active)" : ""}
              </Button>
            </div>

            {groupableFields.length > 0 ? (
              <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Group
                </p>
                <div className="mt-1 grid gap-0.5">
                  {groupableFields.map((groupBy) => (
                    <label
                      key={groupBy.name}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-pine focus:ring-pine dark:border-slate-600 dark:bg-slate-950"
                        checked={groupBys.includes(groupBy.name)}
                        onChange={() => toggleGroupBy(groupBy.name)}
                      />
                      {groupBy.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {sortableFields.length > 0 ? (
              <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Sort
                </p>
                <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                  <SelectField
                    label="Sort by"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                  >
                    {sortableFields.map((option) => (
                      <option key={option.name} value={option.name}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={`Sort ${sortDirection === "asc" ? "ascending" : "descending"}`}
                    onClick={() =>
                      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
                    }
                  >
                    {sortDirection === "asc" ? "Asc" : "Desc"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {activeConditionCount > 0 || groupBys.length > 0 ? (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-slate-500 hover:text-ink dark:text-slate-400 dark:hover:text-slate-100"
          onClick={clearAll}
        >
          Clear all filters
        </button>
      ) : null}

      <FilterBuilder
        isOpen={isFilterBuilderOpen}
        onClose={() => setIsFilterBuilderOpen(false)}
        fields={fields}
        initialDomain={domain}
        onApply={(nextDomain) => {
          setDomain(nextDomain);
          setIsFilterBuilderOpen(false);
        }}
      />
    </div>
  );
}

function FilterPill({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-xs font-semibold text-pine dark:bg-emerald-950 dark:text-emerald-200">
      <span className="max-w-64 truncate">{text}</span>
      <button
        type="button"
        className="rounded-full text-pine/70 hover:text-pine dark:text-emerald-300/70 dark:hover:text-emerald-200"
        aria-label={`Remove ${text} filter`}
        onClick={onRemove}
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}
