import type { SharedExpenseInput } from "@flowledger/shared";
import type { Prisma, Transaction } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import { assertShareableTransaction } from "../utils/assertions.js";
import { legacyParticipantsToSharing } from "../utils/sharingInput.js";
import { applySharedExpenseToTransaction } from "./apply.service.js";
import { getOwnedTransaction } from "./read.service.js";

/** Creates the shared expense of a transaction just created inside `tx` (used by `POST /transactions`); a transfer is rejected with 400. */
export async function createSharedExpenseForTransaction(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  transaction: Pick<Transaction, "id" | "amount" | "name" | "groupId" | "type" | "executionCurrency">,
  input: Omit<SharedExpenseInput, "transactionId"> & { transactionId?: string }
) {
  assertShareableTransaction(transaction);
  const sharedExpense = await applySharedExpenseToTransaction(tx, ownerUserId, transaction, transaction.type, {
    enabled: true,
    title: input.title,
    participants: input.participants ? legacyParticipantsToSharing(input.participants) : []
  });
  return sharedExpense!;
}

/** Validates the target transaction belongs to `userId`, then creates its shared expense; 409 "This transaction is already shared" when one exists. */
export async function createSharedExpense(userId: string, input: SharedExpenseInput) {
  const transaction = await getOwnedTransaction(userId, input.transactionId);
  if (!transaction) {
    throw new HttpError(400, "Transaction is required");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.sharedExpense.findUnique({ where: { transactionId: transaction.id }, select: { id: true } });
    if (existing) throw new HttpError(409, "This transaction is already shared");
    return createSharedExpenseForTransaction(tx, userId, transaction, input);
  });
}
