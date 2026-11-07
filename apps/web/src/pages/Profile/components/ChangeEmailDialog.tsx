import { useState, type FormEvent } from "react";
import { Button } from "../../../components/Button";
import { TextInput } from "../../../components/FormField";
import { ModalDialog } from "./ModalDialog";

/**
 * Modal that asks for the current password before an email change is saved. Mount it only while open
 * so the field starts empty. `error` shows the server's rejection (wrong password, email taken);
 * the dialog stays open until the parent unmounts it.
 */
export function ChangeEmailDialog({
  email,
  error,
  isPending,
  onSubmit,
  onCancel
}: {
  email: string;
  error: string | null;
  isPending: boolean;
  onSubmit: (currentPassword: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(password);
  }

  return (
    <ModalDialog
      titleId="change-email-title"
      title="Confirm email change"
      titleClassName="mb-4 text-lg font-semibold"
      onCancel={onCancel}
    >
      <form className="grid gap-4" onSubmit={submit}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Enter your current password to change your email to <strong>{email}</strong>. You will stay
          signed in here, and your other devices will be signed out.
        </p>
        <TextInput
          label="Current password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          maxLength={128}
        />
        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Change email"}
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}
