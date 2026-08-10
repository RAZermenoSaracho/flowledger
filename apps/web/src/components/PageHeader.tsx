import type { ReactNode } from "react";

/**
 * Standard section header for a page/card that has both a title and record
 * creation: title (with an optional right-aligned action, e.g.
 * `AddRecordButton`) on its own row, then `children` (typically a
 * full-width `<SearchBar>`) in the row below.
 */
export function PageHeader({
  title,
  action,
  children,
  className = ""
}: {
  title: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid gap-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="w-full min-w-0">{children}</div> : null}
    </div>
  );
}
