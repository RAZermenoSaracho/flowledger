import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";

export async function deleteTransaction(userId: string, id: string) {
  const existing = await prisma.transaction.findFirst({
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

  const sharedExpenseId = existing.sharedExpense?.id;
  const participantIds =
    existing.sharedExpense?.participants.map((participant) => participant.id) ??
    [];
  const settlementRequestIds =
    existing.sharedExpense?.participants.flatMap((participant) =>
      participant.settlementRequests.map((request) => request.id)
    ) ?? [];

  await prisma.$transaction(async (tx) => {
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
