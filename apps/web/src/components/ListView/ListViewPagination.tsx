import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { ListPagerState } from "../../types/common.types";
import { Button } from "../Button";

/** Largest window a typed range may cover; the server clamp stays the hard bound. */
const MAX_LIST_WINDOW = 500;
const RANGE_PATTERN = /^\s*(\d+)\s*[-–]\s*(\d+)\s*$/;
const RANGE_ERROR = "Enter a range like 1-40";

/** Parses "a-b" into an `[offset, limit]` window, or `null` when it is not a valid range for `total`. */
function parseRange(text: string, total: number | null): [number, number] | null {
  const match = RANGE_PATTERN.exec(text);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start < 1 || end < start || end - start + 1 > MAX_LIST_WINDOW) return null;
  if (total != null && start > total) return null;
  return [start - 1, end - start + 1];
}

/**
 * Odoo-style editable-range pager: `‹ 41-80 / 312 ›`. Clicking (or Enter/Space on) the range opens a
 * text input; only Enter applies a valid "a-b" entry, while Escape and blur always restore the range.
 * Previous/Next move by the current window size from the current (possibly nonstandard) start, never
 * wrap, and are disabled at the ends and while `isFetching`. Renders nothing when `total` is 0.
 * An unknown `total` (`null`) shows just the range.
 */
export function ListViewPagination({ offset, limit, total, hasNext, isFetching, onRangeChange }: ListPagerState) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const rangeButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const errorId = useId();

  const editing = draft !== null;
  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      rangeButton.current?.focus();
    }
  }, [editing]);

  if (total === 0) return null;

  const start = offset + 1;
  const end = total != null ? Math.min(offset + limit, total) : offset + limit;
  const rangeText = `${start}-${end}`;
  const label = total != null ? `Records ${start} to ${end} of ${total}, edit range` : `Records ${start} to ${end}, edit range`;

  const close = (refocus: boolean) => {
    restoreFocus.current = refocus;
    setDraft(null);
    setInvalid(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      close(true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const range = parseRange(draft ?? "", total);
      if (!range) return setInvalid(true);
      close(true);
      onRangeChange(range[0], range[1]);
    }
  };

  return (
    <nav aria-label="Pagination" className="flex w-full flex-wrap items-center gap-1 sm:w-auto">
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 min-w-11 px-2"
        aria-label="Previous records"
        disabled={offset <= 0 || isFetching}
        onClick={() => onRangeChange(Math.max(0, offset - limit), limit)}
      >
        ‹
      </Button>
      {editing ? (
        <input
          type="text"
          inputMode="text"
          autoFocus
          aria-label="Record range"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => close(false)}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-center text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:w-36 sm:flex-none"
        />
      ) : (
        <button
          ref={rangeButton}
          type="button"
          aria-label={label}
          onClick={() => setDraft(rangeText)}
          className="min-h-11 min-w-0 flex-1 rounded-md px-2 text-center text-sm font-medium text-ink hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800 sm:flex-none"
        >
          <span aria-live="polite">{total != null ? `${rangeText} / ${total}` : rangeText}</span>
        </button>
      )}
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 min-w-11 px-2"
        aria-label="Next records"
        disabled={!hasNext || isFetching || (total != null && offset + limit >= total)}
        onClick={() => onRangeChange(offset + limit, limit)}
      >
        ›
      </Button>
      {invalid ? (
        <p id={errorId} role="alert" className="basis-full text-xs text-red-600 dark:text-red-400">
          {RANGE_ERROR}
        </p>
      ) : null}
    </nav>
  );
}
