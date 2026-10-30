import { Button } from "../../../components/Button";
import { ModalDialog } from "./ModalDialog";

/** Confirmation modal for a destructive revoke/disconnect; Escape or Cancel dismisses it. */
export function ConfirmRevokeDialog({
  title,
  body,
  confirmLabel,
  pending,
  onConfirm,
  onCancel
}: {
  title: string;
  body: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalDialog titleId="confirm-revoke-title" title={title} onCancel={onCancel}>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{body}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="danger" className="min-h-11" disabled={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button type="button" variant="secondary" className="min-h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </ModalDialog>
  );
}
