import type { HTMLAttributes } from "react";

/** Styled container div used as a page-section wrapper. */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
      {...props}
    />
  );
}
