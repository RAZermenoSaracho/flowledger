import type { UpdateSharedExpenseInput } from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";
import { assertShareableTransaction, validateSharedExpenseParticipants } from "../utils/assertions.js";
import { getOwnedTransaction, normalizeSharedExpenseParticipants } from "./read.service.js";
import { notifySharedExpenseParticipants } from "./create.service.js";

export async function updateSharedExpense(
  userId: string,
  sharedExpenseId: string,
  input: UpdateSharedExpenseInput
) {
  const existing = await prisma.sharedExpense.findFirst({
    where: { id: sharedExpenseId, ownerUserId: userId },
    include: { transaction: true, participants: true }
  });
  if (!existing) throw notFound("Shared expense");

  const transaction = await getOwnedTransaction(userId, input.transactionId);
  if (transaction) {
    assertShareableTransaction(transaction);
  }

  const { participants, ...rest } = input;
  const normalizedParticipants = participants
    ? await normalizeSharedExpenseParticipants(
        userId,
        participants,
        transaction?.groupId ?? existing.transaction.groupId
      )
    : undefined;

  if (normalizedParticipants) {
    validateSharedExpenseParticipants(
      transaction?.amount ?? existing.totalAmount,
      normalizedParticipants
    );
  }

  const participantCurrency =
    transaction?.executionCurrency ?? existing.transaction.executionCurrency;
  const existingUserIds = new Set(
    existing.participants
      .map((participant) => participant.userId)
      .filter((id): id is string => Boolean(id))
  );
  const addedUserIds = new Set(
    normalizedParticipants
      ?.map((participant) => participant.userId)
      .filter((id): id is string => Boolean(id))
      .filter((id) => !existingUserIds.has(id)) ?? []
  );

  return prisma.$transaction(async (tx) => {
    const updated = await tx.sharedExpense.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(transaction ? { totalAmount: transaction.amount } : {}),
        ...(normalizedParticipants
          ? {
              participants: {
                deleteMany: {},
                create: normalizedParticipants.map((participant) => ({
                  ...participant,
                  currency: participantCurrency
                }))
              }
            }
          : {})
      },
      include: { transaction: true, participants: true }
    });

    if (addedUserIds.size > 0) {
      await notifySharedExpenseParticipants(
        tx,
        userId,
        updated,
        updated.participants.filter(
          (participant) =>
            participant.userId && addedUserIds.has(participant.userId)
        )
      );
    }

    return updated;
  });
}
