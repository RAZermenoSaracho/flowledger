import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";

type BaseProps = {
  label: string;
};

/** Labeled text input field. */
export function TextInput({
  label,
  className = "",
  ...props
}: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
      <span>{label}</span>
      <input
        className={`min-h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-pine focus:ring-2 focus:ring-mint dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-emerald-900 ${className}`}
        {...props}
      />
    </label>
  );
}

/** Labeled select field. */
export function SelectField({
  label,
  className = "",
  ...props
}: BaseProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
      <span>{label}</span>
      <select
        className={`min-h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-pine focus:ring-2 focus:ring-mint dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-emerald-900 ${className}`}
        {...props}
      />
    </label>
  );
}

/** Labeled textarea field. */
export function TextArea({
  label,
  className = "",
  ...props
}: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
      <span>{label}</span>
      <textarea
        className={`min-h-24 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-pine focus:ring-2 focus:ring-mint dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-emerald-900 ${className}`}
        {...props}
      />
    </label>
  );
}
