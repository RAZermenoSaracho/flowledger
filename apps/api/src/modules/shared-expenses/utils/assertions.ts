import {
  currencyFractionDigits,
  exceedsCurrencyPrecision
} from "@flowledger/shared";
import { Prisma, type Transaction } from "@prisma/client";
import { HttpError } from "../../../utils/httpError.js";
import { fieldError } from "./shareGuards.js";

/** Throws if `transaction` is a transfer — only income and expense transactions can be shared. */
export function assertShareableTransaction(
  transaction: Pick<Transaction, "type">
) {
  if (transaction.type === "transfer") {
    throw new HttpError(
      400,
      "Shared transactions are only supported for income and expense transactions"
    );
  }
}

type ShareLike = { shareAmount: Prisma.Decimal.Value };

/** Throws if the sum of participant shares exceeds `totalAmount`; the comparison is exact. */
export function validateSharedExpenseParticipants(
  totalAmount: Prisma.Decimal,
  participants: ShareLike[]
) {
  const shares = participants.reduce(
    (sum, participant) => sum.plus(participant.shareAmount),
    new Prisma.Decimal(0)
  );
  if (shares.gt(totalAmount)) {
    throw fieldError(
      "sharedExpense.participants",
      "Participant shares cannot exceed the transaction amount"
    );
  }
}

/** Throws a 400 on `field` when `amount` has more fraction digits than `currency` allows (or more than 20 integer digits). */
export function assertAmountPrecision(
  amount: Prisma.Decimal.Value,
  currency: string,
  field: string
) {
  if (
    exceedsCurrencyPrecision(
      typeof amount === "string"
        ? amount
        : new Prisma.Decimal(amount).toFixed(),
      currency
    )
  ) {
    throw fieldError(
      field,
      `${field} allows at most ${currencyFractionDigits(currency)} decimal places for ${currency.toUpperCase()}`
    );
  }
}
