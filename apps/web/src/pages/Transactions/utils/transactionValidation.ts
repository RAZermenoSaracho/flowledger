import { decimalAmountSchema, transactionSchema } from "@flowledger/shared";
import type { Account } from "../../../types/accounts.types";
import type { FormErrors } from "../../../types/common.types";
import { amountPrecisionError, formatMoney } from "../../../utils/currency";
import { compare, isNonZero, isPositive, parseUnits, subtract, sum } from "../../../utils/money";
import type { TransactionDraft } from "../types/transactions.types";
import { sumParticipantShares } from "./transactionDraft";
import { differingCurrency, destinationAccountId, feeApplies } from "./transactionCurrencies";

/** Adds the errors of the cross-currency fields: required when their coupling shows them, precision per their own currency, and a fee's amount/currency pairing. */
function validateAppliedAmounts(draft: TransactionDraft, accounts: Account[], errors: FormErrors) {
  const applied = [
    ["accountAmount", differingCurrency(draft, accounts, draft.accountId)],
    ["destinationAmount", differingCurrency(draft, accounts, destinationAccountId(draft))]
  ] as const;
  for (const [key, currency] of applied) {
    if (!currency) continue;
    const value = draft[key].trim();
    if (value === "") errors[key] = `Enter the amount in ${currency}`;
    else if (!decimalAmountSchema.safeParse(value).success) errors[key] = "Enter a valid amount";
    else {
      const precision = amountPrecisionError(value, currency);
      if (precision) errors[key] = precision;
    }
  }
  if (!feeApplies(draft, accounts)) return;
  const fee = draft.feeAmount.trim();
  if (fee === "") return;
  if (!decimalAmountSchema.safeParse(fee).success) errors.feeAmount = "Enter a valid amount";
  else if (!draft.feeCurrency) errors.feeCurrency = "Choose the fee currency";
  else {
    const precision = amountPrecisionError(fee, draft.feeCurrency);
    if (precision) errors.feeAmount = precision;
  }
}

/**
 * Validates a transaction draft: the shared `transactionSchema` (including its transfer rules)
 * plus the amount/date input checks the schema cannot see. A shared draft also needs at least one participant, positive shares and shares within the
 * amount; participant errors use `participants` and `participants.<index>.shareAmount` (the
 * row whose share first pushes the total over the amount also gets its own error). Amounts are
 * checked as decimal strings against their currency's precision (never rounded); with `accounts`, a
 * differing account or destination currency makes `accountAmount` / `destinationAmount` required, and a fee needs both halves.
 */
export function validateTransactionDraft(draft: TransactionDraft, accounts: Account[] = []): FormErrors {
  const errors: FormErrors = {};
  const isTransfer = draft.type === "transfer";
  const date = new Date(draft.date);

  if (!draft.name.trim()) errors.name = "Name is required";
  if (!decimalAmountSchema.safeParse(draft.amount.trim()).success) {
    errors.amount = "Enter a valid amount";
  } else {
    const precision = amountPrecisionError(draft.amount, draft.executionCurrency);
    if (precision) errors.amount = precision;
  }
  validateAppliedAmounts(draft, accounts, errors);
  if (!draft.date || Number.isNaN(date.getTime())) errors.date = "Enter a valid date and time";

  const result = transactionSchema.safeParse({
    name: draft.name,
    amount: draft.amount.trim(),
    accountAmount: draft.accountAmount.trim() || undefined,
    destinationAmount: draft.destinationAmount.trim() || undefined,
    feeAmount: draft.feeAmount.trim() || undefined,
    feeCurrency: draft.feeCurrency || undefined,
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
    const currency = draft.executionCurrency;
    draft.participants.forEach((participant, index) => {
      const key = `participants.${index}.shareAmount`;
      const precision = participant.shareAmount.trim()
        ? amountPrecisionError(participant.shareAmount, currency)
        : null;
      if (precision) {
        errors[key] = precision;
      } else if (!isPositive(participant.shareAmount, currency)) {
        errors[key] = "Enter a share above 0";
      } else if (
        isNonZero(participant.paidAmount) &&
        compare(participant.shareAmount, participant.paidAmount!, currency) < 0
      ) {
        errors[key] = "A share cannot be lower than what was paid";
      }
    });
    if (parseUnits(draft.amount, currency) !== null) {
      const allocated = sumParticipantShares(draft.participants, currency);
      if (compare(allocated, draft.amount, currency) > 0) {
        const over = subtract(allocated, draft.amount, currency);
        let running = "0";
        const offending = draft.participants.findIndex((participant) => {
          running = sum([running, participant.shareAmount], currency);
          return compare(running, draft.amount, currency) > 0;
        });
        errors[`participants.${offending}.shareAmount`] ??= "This share pushes the total over the amount";
        errors.participants ??= `Over by ${formatMoney(over, currency)} — participant shares cannot exceed the transaction amount.`;
      }
    }
  }

  return errors;
}
