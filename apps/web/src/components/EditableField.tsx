import { Children, cloneElement, isValidElement, useId, type ReactElement } from "react";
import type { EditableFieldProps } from "../types/common.types";

/** Class for a bare native control inside `EditableField`: quiet at rest, ring on hover and focus, 16px text on mobile, 40px high. */
export const editableControlClassName =
  "min-h-10 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-2 text-base text-ink outline-none transition hover:border-slate-200 hover:bg-slate-50 focus:border-pine focus:bg-white focus:ring-2 focus:ring-mint disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:focus:bg-slate-950 dark:focus:ring-emerald-900";

/**
 * A labelled field whose control is always rendered: there is no click-to-activate and no Edit
 * mode. Escape inside a dirty field calls `onRevert`; blur changes nothing, so the draft stays.
 * `readOnly` shows plain text instead of the control. A native-element child is wired with the
 * label (`aria-labelledby`) and, with an `error`, `aria-invalid` and `aria-describedby` to the
 * `role="alert"` message; a custom control must wire those itself.
 */
export function EditableField({
  label,
  hideLabel = false,
  error,
  readOnly = false,
  display,
  dirty = false,
  onRevert,
  children
}: EditableFieldProps) {
  const labelId = useId();
  const errorId = useId();

  const labelNode = (
    <span
      id={labelId}
      className={
        hideLabel
          ? "sr-only"
          : "block text-sm font-medium text-slate-500 dark:text-slate-400"
      }
    >
      {label}
    </span>
  );

  if (readOnly) {
    return (
      <div data-readonly="true">
        {labelNode}
        <p className="min-h-10 px-2 py-2 text-base italic text-slate-600 sm:text-sm dark:text-slate-300">
          {display ?? children}
        </p>
      </div>
    );
  }

  const control = Children.map(children, (child) =>
    isValidElement(child) && typeof child.type === "string"
      ? cloneElement(child as ReactElement<Record<string, unknown>>, {
          "aria-labelledby": labelId,
          ...(error ? { "aria-invalid": true, "aria-describedby": errorId } : {})
        })
      : child
  );

  return (
    <div
      data-dirty={dirty ? "true" : undefined}
      className={`min-w-0 ${dirty ? "border-l-2 border-amber-500 pl-2" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && dirty && onRevert) onRevert();
      }}
    >
      {labelNode}
      {control}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
