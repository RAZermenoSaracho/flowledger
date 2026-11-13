import type { Transaction } from "../../../types/transactions.types";
import { transactionDateInputValue } from "../../../utils/dateTime";
import { isNonZero, sum } from "../../../utils/money";
import type {
  ParticipantDraft,
  TransactionDraft
} from "../types/transactions.types";
import type { TransactionPrefill } from "./transactionPrefill";

/** Builds the saved-values draft of an existing transaction; the date is its local `datetime-local` value. */
export function draftFromTransaction(transaction: Transaction): TransactionDraft {
  const shared = transaction.sharedExpense;
  return {
    name: transaction.name,
    amount: transaction.amount,
    accountAmount:
      transaction.account && transaction.account.currency !== transaction.executionCurrency
        ? (transaction.accountAmount ?? "")
        : "",
    destinationAmount:
      transaction.type === "transfer" &&
      transaction.transferToAccount &&
      transaction.transferToAccount.currency !== transaction.executionCurrency
        ? (transaction.destinationAmount ?? "")
        : "",
    feeAmount: transaction.feeAmount ?? "",
    feeCurrency: transaction.feeCurrency ?? "",
    executionCurrency: transaction.executionCurrency,
    type: transaction.type,
    date: transactionDateInputValue(transaction),
    accountId: transaction.accountId ?? "",
    transferToAccountId: transaction.transferToAccountId ?? "",
    categoryId: transaction.categoryId ?? "",
    groupId: transaction.groupId ?? "",
    notes: transaction.notes ?? "",
    isShared: Boolean(shared),
    sharedTitle: shared?.title ?? "",
    participants: (shared?.participants ?? []).map(
      (participant): ParticipantDraft => ({
        draftId: participant.id,
        id: participant.id,
        paidAmount: participant.paidAmount,
        status: participant.status,
        acceptance: participant.acceptance,
        userId: participant.userId,
        participantName: participant.participantName,
        source: participant.userId ? "app" : "manual",
        shareAmount: participant.shareAmount
      })
    )
  };
}

/** Builds the initial draft of a new transaction: an expense dated `now`, in `currency`, overlaid with the validated `prefill`. */
export function newTransactionDraft(
  currency: string,
  now: string,
  prefill: TransactionPrefill = {}
): TransactionDraft {
  return {
    name: "",
    amount: "",
    accountAmount: "",
    destinationAmount: "",
    feeAmount: "",
    feeCurrency: "",
    executionCurrency: currency,
    type: "expense",
    date: now,
    accountId: "",
    transferToAccountId: "",
    categoryId: "",
    groupId: "",
    notes: "",
    isShared: false,
    sharedTitle: "",
    participants: [],
    ...prefill
  };
}

/** Exact sum of the participants' share inputs in `currency`, ignoring blank or invalid ones. */
export function sumParticipantShares(participants: ParticipantDraft[], currency: string): string {
  return sum(
    participants.map((participant) => participant.shareAmount),
    currency
  );
}

/** Whether a stored line is settled (accepted and fully paid), so the server rejects any change to it. Judged by stored status, not by the editable input. */
export function isShareLocked(participant: ParticipantDraft): boolean {
  return participant.status === "paid" && participant.acceptance === "accepted";
}

/** Whether `userId` may get another allocation line: no line yet, or every existing line has a payment. */
export function canAddAllocation(participants: ParticipantDraft[], userId: string): boolean {
  return participants
    .filter((participant) => participant.userId === userId)
    .every((participant) => isNonZero(participant.paidAmount));
}

/** Whether a participant may be removed from the draft: stored rows with a payment cannot be (the server also rejects pending settlement requests). */
export function canRemoveParticipant(participant: ParticipantDraft): boolean {
  return !isNonZero(participant.paidAmount);
}
