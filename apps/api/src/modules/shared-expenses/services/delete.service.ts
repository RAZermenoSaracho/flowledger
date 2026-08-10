import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";

/** Deletes a shared expense, throwing if it doesn't exist or isn't owned by `userId`. */
export async function deleteSharedExpense(userId: string, sharedExpenseId: string) {
  const existing = await prisma.sharedExpense.findFirst({
    where: { id: sharedExpenseId, ownerUserId: userId }
  });
  if (!existing) throw notFound("Shared expense");

  await prisma.sharedExpense.delete({ where: { id: existing.id } });
}
