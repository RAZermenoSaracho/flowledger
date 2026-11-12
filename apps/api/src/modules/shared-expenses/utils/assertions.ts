import type { Prisma, Transaction } from "@prisma/client";
import { isShareableCurrency } from "@flowledger/shared";
import { HttpError } from "../../../utils/httpError.js";
import { fieldError } from "./shareGuards.js";

/** Message of the 400 raised when a non-shareable currency is shared or settled. */
export const SHAREABLE_CURRENCY_MESSAGE =
  "Sharing is only supported for fiat currencies with up to 2 decimals";

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

/** Throws a 400 unless every given currency is an ISO 4217 currency with at most 2 minor units (the only ones shared-expense and settlement columns hold exactly). `null`/`undefined` entries are skipped. */
export function assertShareableCurrencies(
  currencies: (string | null | undefined)[],
  field = "sharedExpense"
) {
  if (currencies.some((currency) => currency && !isShareableCurrency(currency))) {
    throw fieldError(field, SHAREABLE_CURRENCY_MESSAGE);
  }
}
