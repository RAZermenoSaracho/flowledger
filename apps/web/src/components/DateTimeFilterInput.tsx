import { useState } from "react";
import { TextInput } from "./FormField";

/**
 * Date filter control: one native input, `date` by default and `datetime-local` once "Specific time"
 * is checked. Emits `YYYY-MM-DD` (whole local day) or `YYYY-MM-DDTHH:mm`, and `""` when empty.
 *
 * Why the toggle: Chrome reports a partly filled `datetime-local` as `""` and fires no event while
 * it is being typed, and its calendar fills the current clock time. Turning the time on is the one
 * explicit moment a time is seeded (`defaultTime`: `00:00` for lower bounds, `23:59` for upper
 * bounds, so a bare day becomes the same whole day); focusing or tabbing never applies anything.
 * An incomplete entry, or a year that is not four digits (Chrome passes intermediate keystrokes such
 * as `20261-05-12`, which no range can use), is emitted as `""` and flagged visibly on change and blur.
 */
export function DateTimeFilterInput({
  label,
  value,
  onChange,
  defaultTime = "00:00"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  defaultTime?: "00:00" | "23:59";
}) {
  const [timeOn, setTimeOn] = useState(false);
  const [incomplete, setIncomplete] = useState(false);
  const withTime = timeOn || value.includes("T");

  return (
    <div className="grid min-w-0 gap-1">
      <TextInput
        label={label}
        type={withTime ? "datetime-local" : "date"}
        value={value}
        aria-invalid={incomplete || undefined}
        onChange={(event) => {
          const input = event.currentTarget;
          const unusable = input.validity.badInput || !/^(\d{4}-.*)?$/.test(input.value);
          setIncomplete(unusable);
          onChange(unusable ? "" : input.value);
        }}
        onBlur={(event) => setIncomplete(event.currentTarget.validity.badInput)}
      />
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <label className="flex cursor-pointer items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-slate-300 text-pine focus:ring-pine dark:border-slate-600 dark:bg-slate-950"
            checked={withTime}
            aria-label={`${label} specific time`}
            onChange={(event) => {
              setIncomplete(false);
              setTimeOn(event.target.checked);
              if (!value) return;
              onChange(
                event.target.checked
                  ? `${value.slice(0, 10)}T${defaultTime}`
                  : value.slice(0, 10)
              );
            }}
          />
          Specific time
        </label>
        {incomplete ? (
          <span role="alert" className="text-red-600 dark:text-red-400">
            Incomplete or invalid, not applied
          </span>
        ) : null}
      </div>
    </div>
  );
}
