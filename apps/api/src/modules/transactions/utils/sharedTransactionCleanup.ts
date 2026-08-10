import type { Prisma } from "@prisma/client";

export async function deleteSharedTransactionData(
  tx: Prisma.TransactionClient,
  sharedExpense:
    | {
        id: string;
        participants: {
          id: string;
          settlementRequests: { id: string }[];
        }[];
      }
    | null
    | undefined
) {
  if (!sharedExpense) return;

  await tx.notification.deleteMany({
    where: {
      OR: [
        { metadata: { path: ["sharedExpenseId"], equals: sharedExpense.id } },
        ...sharedExpense.participants.map((participant) => ({
          metadata: { path: ["participantId"], equals: participant.id }
        })),
        ...sharedExpense.participants.flatMap((participant) =>
          participant.settlementRequests.map((settlementRequest) => ({
            metadata: {
              path: ["settlementRequestId"],
              equals: settlementRequest.id
            }
          }))
        )
      ]
    }
  });

  await tx.sharedExpense.delete({ where: { id: sharedExpense.id } });
}
