import { CopyButton } from "./CopyButton";

/** Labelled monospace value with a `CopyButton`; `copyLabel` is the button's accessible name. */
export function CopyRow({ label, value, copyLabel }: { label: string; value: string; copyLabel: string }) {
  return (
    <div className="mt-3 grid gap-1">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md bg-slate-100 p-2 text-xs dark:bg-slate-800">{value}</code>
        <CopyButton value={value} label={copyLabel} />
      </div>
    </div>
  );
}
