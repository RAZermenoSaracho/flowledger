import type { SecuritySearchResult } from "@flowledger/shared";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { editableControlClassName } from "../../../components/EditableField";
import { useSecuritySearch } from "../hooks/useSecuritySearch";

const mutedClassName = "px-2 py-2 text-sm text-slate-500 dark:text-slate-400";

/**
 * Stock/ETF search as an ARIA 1.2 combobox (input, listbox, `aria-activedescendant`): type to search, ArrowUp/ArrowDown
 * move, Enter selects the highlighted result through `onSelect`, Escape closes the list and changes nothing. Shows
 * loading, empty and unavailable states. "Enter ticker manually" is always offered and calls `onManual`, the fallback to
 * a free-text ticker with a manual price. All interactive targets are at least 44 px tall.
 */
export function SecuritySearch({
  label,
  onSelect,
  onManual
}: {
  label: string;
  onSelect: (result: SecuritySearchResult) => void;
  onManual: () => void;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const { status, results } = useSecuritySearch(query);
  const listOpen = isOpen && status === "ready" && results.length > 0;
  const optionId = (index: number) => `${id}-option-${index}`;

  function select(result: SecuritySearchResult) {
    setQuery("");
    setIsOpen(false);
    setActive(-1);
    onSelect(result);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (isOpen) event.stopPropagation();
      setIsOpen(false);
      setActive(-1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (results.length === 0) return;
      event.preventDefault();
      setIsOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive(
        (current) => (current + step + results.length) % results.length
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = results[active];
      if (listOpen && result) select(result);
    }
  }

  const message =
    !isOpen || status === "idle"
      ? null
      : status === "loading"
        ? "Searching..."
        : status === "unavailable"
          ? "Search is unavailable"
          : results.length === 0
            ? "No matching stocks or ETFs"
            : null;

  return (
    <div
      ref={rootRef}
      className="relative grid gap-1"
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={listOpen}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        aria-activedescendant={
          listOpen && active >= 0 ? optionId(active) : undefined
        }
        autoComplete="off"
        maxLength={20}
        className={`${editableControlClassName} min-h-11`}
        placeholder="Search ticker or name"
        value={query}
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
      />
      <ul
        id={`${id}-listbox`}
        role="listbox"
        aria-label={`${label} results`}
        hidden={!listOpen}
        className="max-h-72 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-950"
      >
        {results.map((result, index) => (
          <li
            key={`${result.symbol}:${result.micCode}`}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            className={`min-h-11 cursor-pointer px-3 py-2 ${
              index === active ? "bg-mint dark:bg-emerald-900" : ""
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => select(result)}
            onMouseMove={() => setActive(index)}
          >
            <span className="block text-sm font-semibold">
              {result.symbol} · {result.name}
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              {result.exchange} ({result.micCode}) · {result.currency} ·{" "}
              {result.type === "etf" ? "ETF" : "Stock"}
            </span>
          </li>
        ))}
      </ul>
      {message ? (
        <p role="status" className={mutedClassName}>
          {message}
        </p>
      ) : null}
      <button
        type="button"
        className="min-h-11 w-fit rounded-md px-2 text-left text-sm font-semibold text-pine underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-pine dark:text-emerald-300"
        onClick={onManual}
      >
        Enter ticker manually
      </button>
    </div>
  );
}
