import type { BillingPeriod, UpdateBillingPeriodInput } from "@flowledger/shared";
import { useState } from "react";
import { Button } from "../../../components/Button";
import { useUpdateBillingPeriod } from "../hooks/useUpdateBillingPeriod";

/**
 * Inline editor of a billing period's Period end and Payment due. "Edit dates" reveals two date inputs with Save and Cancel;
 * only changed dates are sent. A rejected value keeps the typed values and shows the API message. Date rules are enforced by the API.
 */
export function BillingPeriodDatesEditor({ accountId, period }: { accountId: string; period: BillingPeriod }) {
  const [editing, setEditing] = useState(false);
  const [end, setEnd] = useState(period.end);
  const [due, setDue] = useState(period.dueDate);
  const update = useUpdateBillingPeriod(accountId, period.key);

  if (!editing) {
    return (
      <Button
        type="button"
        variant="secondary"
        aria-label={`Edit dates of period ${period.key}`}
        onClick={() => {
          setEnd(period.end);
          setDue(period.dueDate);
          update.reset();
          setEditing(true);
        }}
      >
        Edit dates
      </Button>
    );
  }

  const save = () => {
    const body: UpdateBillingPeriodInput = {};
    if (end && end !== period.end) body.closingDate = end;
    if (due && due !== period.dueDate) body.dueDate = due;
    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }
    update.mutate(body, { onSuccess: () => setEditing(false) });
  };

  const inputClass =
    "min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900";
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
        Period end
        <input type="date" className={inputClass} value={end} onChange={(event) => setEnd(event.target.value)} />
      </label>
      <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
        Payment due
        <input type="date" className={inputClass} value={due} onChange={(event) => setDue(event.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button type="button" disabled={update.isPending} onClick={save}>
          Save
        </Button>
        <Button type="button" variant="secondary" disabled={update.isPending} onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      {update.error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {update.error.message}
        </p>
      ) : null}
    </div>
  );
}
