import type { Prisma, Transaction } from "@prisma/client";
import { HttpError } from "../../../utils/httpError.js";
import type { ParticipantInput } from "../types/sharedExpenses.types.js";

/** Throws if `transaction` is a transfer — only income and expense transactions can be shared. */
export function assertShareableTransaction(transaction: Pick<Transaction, "type">) {
  if (transaction.type === "transfer") {
    throw new HttpError(
      400,
      "Shared transactions are only supported for income and expense transactions"
    );
  }
}

function totalParticipantShares(participants: ParticipantInput[]) {
  return participants.reduce(
    (sum, participant) => sum + Number(participant.shareAmount),
    0
  );
}

/** Throws if the sum of participant shares exceeds `totalAmount`. */
export function validateSharedExpenseParticipants(
  totalAmount: Prisma.Decimal,
  participants: ParticipantInput[]
) {
  if (totalParticipantShares(participants) > totalAmount.toNumber()) {
    throw new HttpError(
      400,
      "Participant shares cannot exceed the transaction amount"
    );
  }
}
