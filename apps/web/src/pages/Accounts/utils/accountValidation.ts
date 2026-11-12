import { updateAccountSchema } from "@flowledger/shared";
import type { FormErrors } from "../../../types/common.types";
import type { AccountDraft } from "../types/accounts.types";

/** Validates the account draft with the shared update schema, returning the first message per field. */
export function validateAccountDraft(values: AccountDraft): FormErrors {
  const result = updateAccountSchema.safeParse({
    ...values,
    initialBalance:
      values.initialBalance.trim() === "" ? undefined : values.initialBalance
  });
  const errors: FormErrors = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key) errors[key] ??= issue.message;
    }
  }
  return errors;
}
