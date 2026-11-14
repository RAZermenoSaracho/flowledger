import { Button } from "../../../components/Button";
import { TextInput } from "../../../components/FormField";

const MAX_SETTINGS = 30;

/** Key/value editor for a model's settings (`ctx.settings` in the script). Names are unique; renaming keeps the row's position. */
export function ModelSettingsList({
  settings,
  error,
  onChange
}: {
  settings: Record<string, string>;
  error?: string;
  onChange: (next: Record<string, string>) => void;
}) {
  const entries = Object.entries(settings);

  function rename(index: number, name: string) {
    onChange(Object.fromEntries(entries.map(([key, value], i) => (i === index ? [name, value] : [key, value]))));
  }

  function addSetting() {
    let n = entries.length + 1;
    while (`setting_${n}` in settings) n += 1;
    onChange({ ...settings, [`setting_${n}`]: "" });
  }

  return (
    <section className="grid gap-3" aria-label="Settings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Settings</h3>
        <Button type="button" variant="secondary" disabled={entries.length >= MAX_SETTINGS} onClick={addSetting}>
          Add setting
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {entries.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">No settings.</p> : null}
      {entries.map(([key, value], index) => (
        <div key={index} className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end dark:border-slate-800">
          <TextInput label="Name" value={key} onChange={(event) => rename(index, event.target.value)} />
          <TextInput label={`Value of ${key}`} value={value} onChange={(event) => onChange({ ...settings, [key]: event.target.value })} />
          <Button
            type="button"
            variant="secondary"
            aria-label={`Remove setting ${key}`}
            onClick={() => onChange(Object.fromEntries(entries.filter((_, i) => i !== index)))}
          >
            Remove
          </Button>
        </div>
      ))}
    </section>
  );
}
