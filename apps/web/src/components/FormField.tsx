import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type BaseProps = {
  label: string;
};

export function TextInput({ label, className = "", ...props }: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <input
        className={`min-h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-pine focus:ring-2 focus:ring-mint ${className}`}
        {...props}
      />
    </label>
  );
}

export function SelectField({ label, className = "", ...props }: BaseProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <select
        className={`min-h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-pine focus:ring-2 focus:ring-mint ${className}`}
        {...props}
      />
    </label>
  );
}

export function TextArea({ label, className = "", ...props }: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <textarea
        className={`min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-pine focus:ring-2 focus:ring-mint ${className}`}
        {...props}
      />
    </label>
  );
}
