import { ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export function MultiSelectFilter({
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
