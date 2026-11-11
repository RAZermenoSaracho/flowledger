import type { FormErrors } from "../../../types/common.types";
import type { ProfileDraft } from "../types/profile.types";

/** Validates the profile draft: a non-blank name and a plausible email address. */
export function validateProfile(values: ProfileDraft): FormErrors {
  const errors: FormErrors = {};
  if (!values.name.trim()) errors.name = "Name is required";
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "Enter a valid email address";
  return errors;
}
