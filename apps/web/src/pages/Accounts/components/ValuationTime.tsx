import { useId, useRef, useState, type ReactNode } from "react";
import { useDismiss } from "../../../hooks/useDismiss";
import { formatValuationTime } from "../../../utils/dateTime";

/**
 * Shows when a valuation was last updated, per the `valuation-timestamps` policy: information only, never a state.
 * - `tooltip` (default): `children` (the price) become a focusable button whose "Last updated: ..." tooltip opens on
 *   mouse hover, keyboard focus and tap, and closes on blur, outside tap and Escape. It is announced through
 *   `aria-describedby`.
 * - `label`: `children` followed by a small secondary "Last updated: ..." line, for stacked mobile rows.
 * With no `valuedAt` (cash, or a missing value) nothing is added and `children` render as plain content.
 */
export function ValuationTime({
  valuedAt,
  variant = "tooltip",
  className = "",
  children
}: {
  valuedAt: string | null;
  variant?: "tooltip" | "label";
  className?: string;
  children: ReactNode;
}) {
  const tooltipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const isHovered = useRef(false);
  const isPointerDown = useRef(false);
  useDismiss(rootRef, () => setIsOpen(false), isOpen);

  if (!valuedAt) return <span className={className}>{children}</span>;
  const text = `Last updated: ${formatValuationTime(valuedAt)}`;

  if (variant === "label") {
    return (
      <span className={className}>
        {children}
        <span className="block text-xs text-slate-500 dark:text-slate-400">
          {text}
        </span>
      </span>
    );
  }

  return (
    <span
      ref={rootRef}
      className={`relative ${className}`}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        isHovered.current = true;
        setIsOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        isHovered.current = false;
        setIsOpen(false);
      }}
    >
      <button
        type="button"
        aria-describedby={tooltipId}
        className="cursor-help rounded underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-pine"
        onPointerDown={() => {
          isPointerDown.current = true;
        }}
        onFocus={() => {
          // A pointer press focuses the button before click; only keyboard focus opens here, otherwise a tap would open then toggle closed.
          if (!isPointerDown.current) setIsOpen(true);
        }}
        onBlur={() => setIsOpen(false)}
        onClick={() => {
          isPointerDown.current = false;
          setIsOpen((open) => isHovered.current || !open);
        }}
      >
        {children}
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        hidden={!isOpen}
        className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-max max-w-[16rem] rounded-md bg-slate-900 px-3 py-1.5 text-center text-xs font-medium text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
      >
        {text}
      </span>
    </span>
  );
}
