import { useEffect, useRef } from "react";
import { Button } from "../../../components/Button";
import type { OAuthGrant } from "../../../types/oauth.types";

/** Confirmation modal naming the connected app about to be disconnected; Escape or Cancel dismisses it. */
export function RevokeOAuthGrantDialog({
  grant,
  pending,
  onConfirm,
  onCancel
}: {
  grant: OAuthGrant;
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
      aria-labelledby="revoke-grant-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="w-[min(28rem,calc(100vw-2rem))] rounded-lg bg-white p-6 text-ink backdrop:bg-black/50 dark:bg-slate-900 dark:text-slate-100"
    >
      <h3 id="revoke-grant-title" className="text-lg font-semibold">
        Disconnect "{grant.clientName}"?
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        This app will lose access to your account immediately.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="danger" className="min-h-11" disabled={pending} onClick={onConfirm}>
          Disconnect
        </Button>
        <Button type="button" variant="secondary" className="min-h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </dialog>
  );
}
