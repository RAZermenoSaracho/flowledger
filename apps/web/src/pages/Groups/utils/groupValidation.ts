import { updateGroupSchema } from "@flowledger/shared";
import type { FormErrors } from "../../../types/common.types";
import type { GroupDraft } from "../types/groups.types";

/** Validates the group draft with the shared update schema, returning the first message per field. */
export function validateGroupDraft(values: GroupDraft): FormErrors {
  const result = updateGroupSchema.safeParse(values);
  const errors: FormErrors = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key) errors[key] ??= issue.message;
    }
  }
  return errors;
}
