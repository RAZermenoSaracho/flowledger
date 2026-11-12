import type { Prisma, Transaction } from "@prisma/client";
import { HttpError } from "../../../utils/httpError.js";
import { fieldError } from "./shareGuards.js";

/** Throws if `transaction` is a transfer — only income and expense transactions can be shared. */
export function assertShareableTransaction(transaction: Pick<Transaction, "type">) {
  if (transaction.type === "transfer") {
    throw new HttpError(
      400,
      "Shared transactions are only supported for income and expense transactions"
    );
  }
}

type ShareLike = { shareAmount: Prisma.Decimal | number | string };

function totalParticipantShares(participants: ShareLike[]) {
  return participants.reduce(
    (sum, participant) => sum + Number(participant.shareAmount),
    0
  );
}

/** Throws if the sum of participant shares exceeds `totalAmount`. */
export function validateSharedExpenseParticipants(
  totalAmount: Prisma.Decimal,
  participants: ShareLike[]
) {
  if (Math.round(totalParticipantShares(participants) * 100) > Math.round(totalAmount.toNumber() * 100)) {
    throw fieldError("sharedExpense.participants", "Participant shares cannot exceed the transaction amount");
  }
}
