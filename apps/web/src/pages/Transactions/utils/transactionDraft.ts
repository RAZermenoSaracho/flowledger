import type { Transaction } from "../../../types/transactions.types";
import { transactionDateInputValue } from "../../../utils/dateTime";
import type {
  ParticipantDraft,
  RelatedSettlementRow,
  TransactionDraft
} from "../types/transactions.types";
import type { TransactionPrefill } from "./transactionPrefill";

/** Builds the saved-values draft of an existing transaction; the date is its local `datetime-local` value. */
export function draftFromTransaction(transaction: Transaction): TransactionDraft {
  const shared = transaction.sharedExpense;
  return {
    name: transaction.name,
    amount: String(transaction.amount),
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
        userId: participant.userId,
        participantName: participant.participantName,
        source: participant.userId ? "app" : "manual",
        shareAmount: String(participant.shareAmount)
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

/** Sum of the participants' share inputs, ignoring blank or non-numeric ones. */
export function sumParticipantShares(participants: ParticipantDraft[]): number {
  return participants.reduce((sum, participant) => {
    const share = Number(participant.shareAmount);
    return sum + (Number.isFinite(share) ? share : 0);
  }, 0);
}

/** Lists the settlement transactions linked to `transaction` in either direction through `TransactionRelation`. */
export function relatedSettlementRows(transaction: Transaction): RelatedSettlementRow[] {
  return [
    ...(transaction.relations ?? []).map((relation) => ({
      id: relation.id,
      relationType: relation.relationType,
      transaction: relation.relatedTransaction
    })),
    ...(transaction.relatedBy ?? []).map((relation) => ({
      id: relation.id,
      relationType: relation.relationType,
      transaction: relation.transaction
    }))
  ];
}
