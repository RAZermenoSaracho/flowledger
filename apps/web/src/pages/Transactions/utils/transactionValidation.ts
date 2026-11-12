import { transactionSchema } from "@flowledger/shared";
import type { FormErrors } from "../../../types/common.types";
import { formatMoney } from "../../../utils/currency";
import type { TransactionDraft } from "../types/transactions.types";
import { sumParticipantShares } from "./transactionDraft";

/**
 * Validates a transaction draft: the shared `transactionSchema` (including its transfer rules)
 * plus the amount/date input checks the schema cannot see. A shared draft also needs at least one participant, positive shares and shares within the
 * amount; participant errors use `participants` and `participants.<index>.shareAmount` (the
 * row whose share first pushes the total over the amount also gets its own error).
 */
export function validateTransactionDraft(draft: TransactionDraft): FormErrors {
  const errors: FormErrors = {};
  const isTransfer = draft.type === "transfer";
  const date = new Date(draft.date);
  const amount = Number(draft.amount);

  if (!draft.name.trim()) errors.name = "Name is required";
  if (draft.amount.trim() === "" || !Number.isFinite(amount)) {
    errors.amount = "Enter a valid amount";
  }
  if (!draft.date || Number.isNaN(date.getTime())) errors.date = "Enter a valid date and time";

  const result = transactionSchema.safeParse({
    name: draft.name,
    amount: Number.isFinite(amount) ? amount : 0,
    executionCurrency: draft.executionCurrency,
    type: draft.type,
    date: Number.isNaN(date.getTime()) ? "2000-01-01" : date.toISOString(),
    accountId: draft.accountId || null,
    transferToAccountId: isTransfer ? draft.transferToAccountId || null : null,
    categoryId: isTransfer ? null : draft.categoryId || null,
    groupId: isTransfer ? null : draft.groupId || null,
    notes: draft.notes || null
  });
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key) errors[key] ??= issue.message;
    }
  }

  if (!isTransfer && draft.isShared) {
    if (draft.participants.length === 0) {
      errors.participants = "Add at least one participant to share this transaction";
    }
    draft.participants.forEach((participant, index) => {
      if (!(Number(participant.shareAmount) > 0)) {
        errors[`participants.${index}.shareAmount`] = "Enter a share above 0";
      } else if (Number(participant.shareAmount) < (participant.paidAmount ?? 0)) {
        errors[`participants.${index}.shareAmount`] = "A share cannot be lower than what was paid";
      }
    });
    const over = sumParticipantShares(draft.participants) - amount;
    if (Number.isFinite(over) && Math.round(over * 100) > 0) {
      let running = 0;
      const offending = draft.participants.findIndex((participant) => {
        running += Number(participant.shareAmount) || 0;
        return Math.round((running - amount) * 100) > 0;
      });
      errors[`participants.${offending}.shareAmount`] ??= "This share pushes the total over the amount";
      errors.participants ??= `Over by ${formatMoney(over, draft.executionCurrency)} — participant shares cannot exceed the transaction amount.`;
    }
  }

  return errors;
}
