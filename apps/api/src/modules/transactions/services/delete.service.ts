import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";
import { assertNoSettlementActivity } from "../../shared-expenses/utils/shareGuards.js";

/** Deletes a transaction owned by `userId`, cascading notifications tied to it and any linked shared expense/participants; throws 400 while the shared expense has payments or pending/approved settlements. */
export async function deleteTransaction(userId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: { id, userId },
      include: {
        sharedExpense: {
          include: {
            participants: {
              include: { settlementRequests: true }
            }
          }
        }
      }
    });
    if (!existing) throw notFound("Transaction");

    if (existing.sharedExpense) {
      assertNoSettlementActivity(existing.sharedExpense.participants, "delete the transaction", "sharedExpense");
    }

    const sharedExpenseId = existing.sharedExpense?.id;
    const participantIds = existing.sharedExpense?.participants.map((participant) => participant.id) ?? [];
    const settlementRequestIds =
      existing.sharedExpense?.participants.flatMap((participant) =>
        participant.settlementRequests.map((request) => request.id)
      ) ?? [];

    await tx.notification.deleteMany({
      where: {
        OR: [
          { metadata: { path: ["transactionId"], equals: existing.id } },
          ...(sharedExpenseId
            ? [
                {
                  metadata: {
                    path: ["sharedExpenseId"],
                    equals: sharedExpenseId
                  }
                }
              ]
            : []),
          ...participantIds.map((participantId) => ({
            metadata: { path: ["participantId"], equals: participantId }
          })),
          ...settlementRequestIds.map((settlementRequestId) => ({
            metadata: {
              path: ["settlementRequestId"],
              equals: settlementRequestId
            }
          }))
        ]
      }
    });

    await tx.transaction.delete({ where: { id: existing.id } });
  });
}
