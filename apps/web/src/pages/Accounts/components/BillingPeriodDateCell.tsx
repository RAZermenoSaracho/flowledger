import type { BillingPeriod } from "@flowledger/shared";
import { useEffect, useRef, useState } from "react";
import { editableControlClassName } from "../../../components/EditableField";
import { formatFilterValue } from "../../../utils/dateTime";
import { useUpdateBillingPeriod } from "../hooks/useUpdateBillingPeriod";

/**
 * One editable date (`end` or `due`) of a billing period. The date is a button; activating it turns the cell into a native date
 * input. Enter or blur saves a changed date, Escape restores the value; an empty or unchanged value just closes. While the save
 * (and the refetch it triggers) runs the cell shows "Saving…"; a rejected value keeps the input and the typed date with the API
 * message under it. An adjusted date also shows an "Adjusted" badge, the card's default, and a reset-to-default button.
 * Date rules are enforced by the API.
 */
export function BillingPeriodDateCell({
  accountId,
  period,
  field
}: {
  accountId: string;
  period: BillingPeriod;
  field: "end" | "due";
}) {
  const update = useUpdateBillingPeriod(accountId, period.key);
  const isEnd = field === "end";
  const value = isEnd ? period.end : period.dueDate;
  const defaultValue = isEnd ? period.defaultEnd : period.defaultDue;
  const adjusted = isEnd ? period.endAdjusted : period.dueAdjusted;
  const label = isEnd ? "Period end" : "Payment due";
  const bodyKey = isEnd ? "closingDate" : "dueDate";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const finished = useRef(false);
  const refocus = useRef(false);

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const close = () => {
    finished.current = true;
    update.reset();
    refocus.current = true;
    setEditing(false);
  };

  const commit = () => {
    if (finished.current || update.isPending) return;
    if (!draft || draft === value) {
      close();
      return;
    }
    finished.current = true;
    update.mutate(
      { [bodyKey]: draft },
      { onSuccess: close, onError: () => (finished.current = false) }
    );
  };

  return (
    <div>
      {editing ? (
        <input
          type="date"
          autoFocus
          aria-label={`${label}, period ${period.key}`}
          aria-invalid={update.error ? true : undefined}
          className={editableControlClassName}
          value={draft}
          readOnly={update.isPending}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") close();
          }}
        />
      ) : (
        <button
          ref={buttonRef}
          type="button"
          className="rounded px-1 text-left underline decoration-dotted underline-offset-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label={`Edit ${label} of period ${period.key}, currently ${formatFilterValue(value)}`}
          disabled={update.isPending}
          onClick={() => {
            finished.current = false;
            update.reset();
            setDraft(value);
            setEditing(true);
          }}
        >
          {formatFilterValue(value)}
        </button>
      )}
      {update.isPending ? (
        <span
          role="status"
          className="ml-1 text-xs text-slate-500 dark:text-slate-400"
        >
          Saving…
        </span>
      ) : null}
      {adjusted && !editing ? (
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            Adjusted
          </span>
          <span>Default {formatFilterValue(defaultValue)}</span>
          <button
            type="button"
            className="rounded px-1 text-base leading-none text-pine hover:bg-slate-100 disabled:opacity-60 dark:text-emerald-300 dark:hover:bg-slate-800"
            aria-label={`Reset ${label} to default for period ${period.key}`}
            disabled={update.isPending}
            onClick={() => {
              refocus.current = true;
              update.mutate(
                { [bodyKey]: null },
                { onSuccess: () => buttonRef.current?.focus() }
              );
            }}
          >
            <span aria-hidden="true">↺</span>
          </button>
        </span>
      ) : null}
      <div aria-live="polite">
        {update.error ? (
          <p
            role="alert"
            className="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {update.error.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
