import { MoreVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Three-dot dropdown for row-level actions. Visibility is entirely caller-
 * controlled via `className` (see `RecordCard`, which shows this only when
 * its own width-based measurement decides inline buttons wouldn't fit) —
 * this component has no built-in viewport breakpoint of its own.
 */
export function ActionMenu({
  label,
  children,
  className = "relative shrink-0"
}: {
  label: string;
  children: ReactNode;
  /** Positioning classes for the root element — defaults to an inline `relative` box; pass an `absolute ...` class to corner-anchor it directly (see `RecordCard`, which does this instead of wrapping `<ActionMenu>` in its own extra positioned div). */
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={className}>
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 grid w-[min(12rem,calc(100vw-1.5rem))] gap-1 rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          onClick={() => setIsOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Single action row rendered inside `ActionMenu`. */
export function ActionMenuItem({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "danger";
}) {
  const variantClasses =
    variant === "danger"
      ? "text-coral hover:bg-red-50 dark:text-orange-300 dark:hover:bg-red-950/40"
      : "text-ink hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800";

  return (
    <button
      type="button"
      role="menuitem"
      className={`rounded px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses} ${className}`}
      {...props}
    />
  );
}
