import { usernameSchema } from "@flowledger/shared";
import type { FormErrors } from "../../../types/common.types";
import type { ProfileDraft } from "../types/profile.types";

/**
 * Validates the profile draft: a non-blank name, a plausible email address and a username that
 * passes the shared rules and is not `takenUsername` (a name the availability check reported as taken).
 */
export function validateProfile(values: ProfileDraft, takenUsername: string | null = null): FormErrors {
  const errors: FormErrors = {};
  if (!values.name.trim()) errors.name = "Name is required";
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "Enter a valid email address";
  const username = usernameSchema.safeParse(values.username);
  if (!username.success) errors.username = username.error.issues[0]?.message ?? "Enter a valid username";
  else if (username.data === takenUsername) errors.username = "That username is taken";
  return errors;
}
