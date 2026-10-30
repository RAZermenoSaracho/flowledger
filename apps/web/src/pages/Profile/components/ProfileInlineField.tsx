import { useId, useRef, useState, type ReactNode } from "react";

/**
 * Odoo-style inline field: plain text until activated (click, Enter or Space), then `children` (the input)
 * renders and its first focusable element is focused. Escape calls `onRevert` and leaves edit mode; focus
 * leaving the field exits edit mode but keeps the draft. `error` is announced and linked via the wrapper.
 */
export function ProfileInlineField({
  label,
  display,
  error,
  disabled,
  onRevert,
  children
}: {
  label: string;
  display: string;
  error?: string;
  disabled?: boolean;
  onRevert: () => void;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const errorId = useId();
  const activate = () => {
    setEditing(true);
    setTimeout(
      () => ref.current?.querySelector<HTMLElement>("input,select")?.focus(),
      0
    );
  };

  return (
    <div
      ref={ref}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !error)
          setEditing(false);
      }}
      onKeyDown={(event) => {
        if (editing && event.key === "Escape") {
          onRevert();
          setEditing(false);
        }
      }}
    >
      {editing || error ? (
        <div aria-describedby={error ? errorId : undefined}>{children}</div>
      ) : (
        <>
          <span className="text-slate-500 dark:text-slate-400">{label}</span>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Edit ${label}: ${display}`}
            onClick={activate}
            className="-mx-1 block max-w-full cursor-text break-words rounded px-1 text-left text-ink hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pine dark:text-slate-100 dark:hover:bg-slate-800"
          >
            {display}
          </button>
        </>
      )}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
