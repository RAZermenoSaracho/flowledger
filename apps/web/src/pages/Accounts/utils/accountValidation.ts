import { refineCreditCardAccount, updateAccountSchema } from "@flowledger/shared";
import { amountPrecisionError } from "../../../utils/currency";
import type { FormErrors } from "../../../types/common.types";
import type { AccountDraft } from "../types/accounts.types";
import { creditCardFields } from "./creditCardDraft";

/** Validates the account draft with the shared update schema plus the card rules, returning the first message per field. */
export function validateAccountDraft(values: AccountDraft): FormErrors {
  const { name, type, identifier, currency } = values;
  const result = updateAccountSchema.superRefine(refineCreditCardAccount).safeParse({
    name,
    type,
    identifier,
    currency,
    initialBalance:
      values.initialBalance.trim() === "" ? undefined : values.initialBalance,
    ...(values.type === "credit_card" ? creditCardFields(values) : {})
  });
  const errors: FormErrors = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key) errors[key] ??= issue.message;
    }
  }
  if (!errors.initialBalance && values.initialBalance.trim() !== "") {
    const precision = amountPrecisionError(values.initialBalance, values.currency);
    if (precision) errors.initialBalance = precision;
  }
  return errors;
}
