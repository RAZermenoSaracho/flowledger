import type { HTMLAttributes, ReactNode } from "react";

/** Shared responsive surface for custom dropdown option menus. */
export function DropdownMenu({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={`absolute left-0 right-0 top-full z-30 mt-2 min-w-0 max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
