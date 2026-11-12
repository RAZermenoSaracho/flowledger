import { useId, useRef, useState, type ReactNode } from "react";

const BANK_SYNC_UNAVAILABLE_TOOLTIP =
  "Bank synchronization is temporarily unavailable.";

/** One-line notice shown where bank-sync actions are unavailable; existing data stays usable. */
export function BankSyncUnavailableNotice() {
  return (
    <p className="text-sm text-slate-500 dark:text-slate-400">
      Bank connections and synchronization are temporarily disabled. Your
      existing accounts and transactions remain available.
    </p>
  );
}

/** Props a render-prop child must spread onto its control so it is announced as disabled and described by the tooltip. */
export type UnavailableActionProps = {
  "aria-disabled"?: true;
  "aria-describedby"?: string;
};

/**
 * Wraps a control that is unavailable but must stay focusable. When `unavailable`, the child receives
 * `aria-disabled`/`aria-describedby` props (and must make its own click a no-op); the tooltip shows on keyboard
 * focus, mouse hover, and tap (tap toggles), and Escape closes it. When available, the child gets no extra props
 * and nothing is wrapped.
 */
export function UnavailableActionTooltip({
  unavailable,
  className = "",
  children
}: {
  unavailable: boolean;
  className?: string;
  children: (props: UnavailableActionProps) => ReactNode;
}) {
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const isHovered = useRef(false);
  const isPointerDown = useRef(false);

  if (!unavailable) return <>{children({})}</>;

  return (
    <span
      className={`relative flex flex-col ${className}`}
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
      onPointerDown={() => {
        isPointerDown.current = true;
      }}
      onFocus={() => {
        // A pointer press focuses the control before click; only keyboard focus opens here, otherwise a tap would open then immediately toggle closed.
        if (!isPointerDown.current) setIsOpen(true);
      }}
      onBlur={() => setIsOpen(false)}
      onClick={() => {
        isPointerDown.current = false;
        setIsOpen((open) => isHovered.current || !open);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setIsOpen(false);
      }}
    >
      {children({ "aria-disabled": true, "aria-describedby": tooltipId })}
      <span
        id={tooltipId}
        role="tooltip"
        hidden={!isOpen}
        className={`pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-max max-w-[16rem] rounded-md bg-slate-900 px-3 py-1.5 text-center text-xs font-medium text-white shadow-lg dark:bg-slate-100 dark:text-slate-900`}
      >
        {BANK_SYNC_UNAVAILABLE_TOOLTIP}
      </span>
    </span>
  );
}
