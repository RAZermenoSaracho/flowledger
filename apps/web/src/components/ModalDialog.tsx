import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Native `<dialog>` shell opened with `showModal()` on mount. Mount it only while open.
 * Escape calls `onCancel`; omit `onCancel` to make Escape inert (the dialog can then only be
 * closed by its own content). `widthClass` overrides the default 28rem width.
 */
export function ModalDialog({
  titleId,
  title,
  onCancel,
  widthClass = "w-[min(28rem,calc(100vw-2rem))]",
  titleClassName = "text-lg font-semibold",
  children
}: {
  titleId: string;
  title: string;
  onCancel?: () => void;
  widthClass?: string;
  titleClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel?.();
      }}
      className={`${widthClass} rounded-lg bg-white p-6 text-ink backdrop:bg-black/50 dark:bg-slate-900 dark:text-slate-100`}
    >
      <h3 id={titleId} className={titleClassName}>
        {title}
      </h3>
      {children}
    </dialog>
  );
}
