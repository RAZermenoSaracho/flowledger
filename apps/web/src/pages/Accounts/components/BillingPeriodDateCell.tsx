import type { BillingPeriod } from "@flowledger/shared";
import { formatFilterValue } from "../../../utils/dateTime";
import { useUpdateBillingPeriod } from "../hooks/useUpdateBillingPeriod";

/**
 * One date (`end` or `due`) of a billing period. A manually adjusted date shows an "Adjusted" marker, the card's default date,
 * and a reset-to-default action; the reset error from the API, if any, is shown under the date.
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

  return (
    <div>
      <span>{formatFilterValue(value)}</span>
      {adjusted ? (
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            Adjusted
          </span>
          <span>Default {formatFilterValue(defaultValue)}</span>
          <button
            type="button"
            className="font-medium text-pine underline-offset-2 hover:underline disabled:opacity-60 dark:text-emerald-300"
            aria-label={`Reset ${label} to default for period ${period.key}`}
            disabled={update.isPending}
            onClick={() => update.mutate(isEnd ? { closingDate: null } : { dueDate: null })}
          >
            Reset to default
          </button>
        </span>
      ) : null}
      {update.error ? (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {update.error.message}
        </p>
      ) : null}
    </div>
  );
}
