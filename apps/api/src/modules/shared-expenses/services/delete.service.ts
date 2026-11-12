import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";
import { deleteSharedTransactionData } from "../../transactions/utils/sharedTransactionCleanup.js";
import { assertNoSettlementActivity } from "../utils/shareGuards.js";

/** Deletes a shared expense (and its notifications), throwing 404 if not owned by `userId` and 400 while any payment or pending/approved settlement exists. */
export async function deleteSharedExpense(userId: string, sharedExpenseId: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.sharedExpense.findFirst({
      where: { id: sharedExpenseId, ownerUserId: userId },
      include: { participants: { include: { settlementRequests: true } } }
    });
    if (!existing) throw notFound("Shared expense");
    assertNoSettlementActivity(existing.participants, "delete the shared expense", "sharedExpense");
    await deleteSharedTransactionData(tx, existing);
  });
}
