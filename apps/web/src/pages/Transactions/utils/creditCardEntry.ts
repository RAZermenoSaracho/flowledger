import type { CreditCardKind } from "@flowledger/shared";
import type { Account } from "../../../types/accounts.types";
import type { TransactionDraft } from "../types/transactions.types";

/** One choice of the "Card entry" field; an empty `value` is "Other credit" (income) or "Charge" (expense). */
export type CardEntryOption = { value: CreditCardKind | ""; label: string };

const INCOME_OPTIONS: CardEntryOption[] = [
  { value: "payment", label: "Payment" },
  { value: "refund", label: "Refund" },
  { value: "cashback", label: "Cashback" },
  { value: "", label: "Other credit" }
];

const EXPENSE_OPTIONS: CardEntryOption[] = [
  { value: "interest", label: "Interest" },
  { value: "", label: "Charge" }
];

/** Whether the draft's source account is a credit card. */
export function isCardDraft(draft: TransactionDraft, accounts: Account[]): boolean {
  return accounts.find((account) => account.id === draft.accountId)?.type === "credit_card";
}

/** The "Card entry" options for the draft, or `null` when the field does not apply (not a card, or a transfer). */
export function cardEntryOptions(draft: TransactionDraft, accounts: Account[]): CardEntryOption[] | null {
  if (draft.type === "transfer" || !isCardDraft(draft, accounts)) return null;
  return draft.type === "income" ? INCOME_OPTIONS : EXPENSE_OPTIONS;
}

/**
 * Keeps the card classification consistent with the rest of the draft: it is cleared when the account
 * is not a card, the type is a transfer, or the kind no longer fits the type (payment/refund/cashback
 * on income, interest on expense). Leaving `refund` also clears the refunded category.
 */
export function reconcileCardEntry(draft: TransactionDraft, accounts: Account[]): TransactionDraft {
  const options = cardEntryOptions(draft, accounts);
  const kind = options?.some((option) => option.value === draft.creditCardKind) ? draft.creditCardKind : "";
  const offset = draft.creditCardKind === "refund" && kind !== "refund" ? "" : draft.expenseOffsetCategoryId;
  return kind === draft.creditCardKind && offset === draft.expenseOffsetCategoryId
    ? draft
    : { ...draft, creditCardKind: kind, expenseOffsetCategoryId: offset };
}

/** Sets the card classification, clearing the refunded category unless it is a refund. */
export function selectCardEntry(draft: TransactionDraft, kind: CreditCardKind | ""): TransactionDraft {
  return {
    ...draft,
    creditCardKind: kind,
    expenseOffsetCategoryId: kind === "refund" ? draft.expenseOffsetCategoryId : ""
  };
}
