import { TextInput } from "./FormField";

/**
 * Date filter control: a native date field plus an optional native time field.
 * Emits `YYYY-MM-DD` for a date alone, `YYYY-MM-DDTHH:mm` once a time is set, and `""` when the
 * date is cleared. The time field stays disabled until a date is chosen. The two fields wrap onto
 * separate rows when their container is narrower than both minimum widths (no viewport breakpoint).
 */
export function DateTimeFilterInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [date = "", time = ""] = value.split("T");

  return (
    <div className="flex flex-wrap gap-2">
      <div className="min-w-[11rem] flex-[2_1_11rem]">
        <TextInput
          label={label}
          type="date"
          value={date}
          onChange={(event) => {
            const nextDate = event.target.value;
            onChange(nextDate && time ? `${nextDate}T${time}` : nextDate);
          }}
        />
      </div>
      <div className="min-w-[7rem] flex-[1_1_7rem]">
        <TextInput
          label={`${label} time`}
          type="time"
          value={time}
          disabled={!date}
          onChange={(event) =>
            onChange(event.target.value ? `${date}T${event.target.value}` : date)
          }
        />
      </div>
    </div>
  );
}
