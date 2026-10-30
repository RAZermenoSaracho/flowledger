import { useEffect, useRef } from "react";
import { Button } from "../../../components/Button";
import type { ApiKey } from "../../../types/apiKeys.types";

/** Confirmation modal naming the API key about to be revoked; Escape or Cancel dismisses it. */
export function RevokeApiKeyDialog({
  apiKey,
  pending,
  onConfirm,
  onCancel
}: {
  apiKey: ApiKey;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="revoke-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="w-[min(28rem,calc(100vw-2rem))] rounded-lg bg-white p-6 text-ink backdrop:bg-black/50 dark:bg-slate-900 dark:text-slate-100"
    >
      <h3 id="revoke-title" className="text-lg font-semibold">
        Revoke "{apiKey.name}"?
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Anything using this key will stop working immediately.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="danger" className="min-h-11" disabled={pending} onClick={onConfirm}>
          Revoke key
        </Button>
        <Button type="button" variant="secondary" className="min-h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </dialog>
  );
}
