import { useMutation } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import * as usersClient from "../../../services/users.client";

/** Controlled state and submit handler for the change-password form; clears the fields on success. `submit` resolves `true` on success, `false` on a mismatch or server error (shown via `error`). */
export function usePasswordChange() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => usersClient.updatePassword({ currentPassword, newPassword, confirmPassword }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated");
    }
  });

  async function submit(event: FormEvent): Promise<boolean> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    try {
      await mutation.mutateAsync();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Password could not be updated");
      return false;
    }
  }

  return {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    message,
    error,
    isPending: mutation.isPending,
    submit
  };
}
