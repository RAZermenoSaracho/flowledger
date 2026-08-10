import type { HTMLAttributes } from "react";

/**
 * Styled container div used as a page-section wrapper. `min-w-0` is part of
 * the base style, not opt-in: `Card` is almost always placed as a direct
 * child of a `grid gap-*` layout, and a grid item's automatic minimum width
 * defaults to its content's min-content size (CSS Grid's `min-width: auto`
 * behavior) — wide-enough content inside the card (e.g. a `SearchBar`'s
 * pill row) would otherwise force the whole grid track wider than its
 * container instead of shrinking.
 */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
      {...props}
    />
  );
}
