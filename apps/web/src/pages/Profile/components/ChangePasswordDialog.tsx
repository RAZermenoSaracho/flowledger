import type { FormEvent } from "react";
import { Button } from "../../../components/Button";
import { TextInput } from "../../../components/FormField";
import { ModalDialog } from "./ModalDialog";
import { usePasswordChange } from "../hooks/usePasswordChange";

/**
 * Modal change-password form (current, new, confirm). Mount it only while open so the fields
 * start empty each time; Escape and Cancel call `onCancel`, success calls `onChanged`.
 * Validation and server errors (e.g. wrong current password) render inline.
 */
export function ChangePasswordDialog({
  onCancel,
  onChanged
}: {
  onCancel: () => void;
  onChanged: () => void;
}) {
  const p = usePasswordChange();

  async function submit(event: FormEvent) {
    if (await p.submit(event)) onChanged();
  }

  return (
    <ModalDialog
      titleId="change-password-title"
      title="Change password"
      titleClassName="mb-4 text-lg font-semibold"
      onCancel={onCancel}
    >
      <form className="grid gap-4" onSubmit={submit}>
        <TextInput
          label="Current password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={p.currentPassword}
          onChange={(event) => p.setCurrentPassword(event.target.value)}
          required
          maxLength={128}
        />
        <TextInput
          label="New password"
          type="password"
          autoComplete="new-password"
          value={p.newPassword}
          onChange={(event) => p.setNewPassword(event.target.value)}
          required
          minLength={8}
          maxLength={128}
        />
        <TextInput
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={p.confirmPassword}
          onChange={(event) => p.setConfirmPassword(event.target.value)}
          required
          minLength={8}
          maxLength={128}
        />
        {p.error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {p.error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={p.isPending}>
            Change password
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}
