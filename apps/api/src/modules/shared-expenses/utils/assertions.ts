import type { Prisma, Transaction } from "@prisma/client";
import { HttpError } from "../../../utils/httpError.js";
import type { ParticipantInput } from "../types/sharedExpenses.types.js";

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
