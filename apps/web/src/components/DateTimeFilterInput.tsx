import { useState } from "react";
import { transactionDateNowInputValue } from "../utils/dateTime";
import { TextInput } from "./FormField";

/**
 * Date filter control: one `datetime-local` input that emits `YYYY-MM-DDTHH:mm`, or `""` when empty.
 *
 * Chrome reports a partly filled `datetime-local` as `""` and fires no event while it is typed, and
 * its calendar fills the current clock time when the field is empty. So while the value is empty
 * and the field has focus, it shows a local draft of today at `defaultTime` (`00:00` for lower
 * bounds, `23:59` for upper bounds): picking or typing only a date yields a complete value whose
 * time covers the whole day under the inclusive-minute rule. The draft is never emitted; focusing,
 * tabbing, or blurring without a change applies nothing, and a time the user changes is kept.
 * A bare `YYYY-MM-DD` value (older saved filters) displays at `defaultTime` and keeps its meaning.
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
  const [drafting, setDrafting] = useState(false);
  const [incomplete, setIncomplete] = useState(false);
  const shown = value.includes("T")
    ? value
    : value
      ? `${value}T${defaultTime}`
      : drafting
        ? `${transactionDateNowInputValue().slice(0, 10)}T${defaultTime}`
        : "";

  return (
    <div className="grid min-w-0 gap-1">
      <TextInput
        label={label}
        type="datetime-local"
        value={shown}
        aria-invalid={incomplete || undefined}
        onFocus={() => setDrafting(!value)}
        onChange={(event) => {
          const input = event.currentTarget;
          const unusable =
            input.validity.badInput || !/^(\d{4}-.*)?$/.test(input.value);
          setDrafting(false);
          setIncomplete(unusable);
          onChange(unusable ? "" : input.value);
        }}
        onBlur={(event) => {
          setDrafting(false);
          setIncomplete(event.currentTarget.validity.badInput);
        }}
      />
      {incomplete ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          Incomplete or invalid, not applied
        </span>
      ) : null}
    </div>
  );
}
