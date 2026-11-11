import type { UpdateSharedExpenseInput } from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { HttpError, notFound } from "../../../utils/httpError.js";
import { createDedupedNotifications } from "../../notifications/services/create.service.js";
import { publicUserSelect, userLabel } from "../../users/utils/publicUser.js";
import { fieldError } from "../utils/shareGuards.js";
import { legacyParticipantsToSharing } from "../utils/sharingInput.js";
import { applySharedExpenseToTransaction } from "./apply.service.js";
import { getSharedExpenseById } from "./read.service.js";

/**
 * Updates a shared expense owned by `userId` through {@link applySharedExpenseToTransaction}: participants are diffed
 * (never deleted and recreated), client `paidAmount`/`status` are ignored and every settlement guard applies. The
 * shared expense cannot be moved to another transaction.
 */
export async function updateSharedExpense(userId: string, sharedExpenseId: string, input: UpdateSharedExpenseInput) {
  const existing = await prisma.sharedExpense.findFirst({
    where: { id: sharedExpenseId, ownerUserId: userId },
    include: { transaction: true }
  });
  if (!existing) throw notFound("Shared expense");
  if (input.transactionId && input.transactionId !== existing.transactionId) {
    throw fieldError("transactionId", "A shared expense cannot be moved to another transaction");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await applySharedExpenseToTransaction(tx, userId, existing.transaction, existing.transaction.type, {
      enabled: true,
      title: input.title,
      participants: input.participants ? legacyParticipantsToSharing(input.participants) : undefined
    });
    if (input.status && input.status !== existing.status) {
      return tx.sharedExpense.update({
        where: { id: existing.id },
        data: { status: input.status },
        include: { transaction: true, participants: true }
      });
    }
    return updated!;
  });
}

/**
 * The participant `userId` accepts or rejects their own `proposed` share. Scoped by `sharedExpenseId` and `userId`,
 * so the owner and other users get 404; a share that is not `proposed` gets 400. Notifies the owner.
 * @returns the shared expense as the participant sees it.
 */
export async function respondToSharedExpense(
  userId: string,
  sharedExpenseId: string,
  decision: "accepted" | "rejected"
) {
  const participant = await prisma.$transaction(async (tx) => {
    const row = await tx.sharedExpenseParticipant.findFirst({
      where: { sharedExpenseId, userId },
      include: {
        sharedExpense: { select: { ownerUserId: true, title: true, transactionId: true } },
        user: { select: publicUserSelect }
      }
    });
    if (!row) throw notFound("Shared expense");

    const changed = await tx.sharedExpenseParticipant.updateMany({
      where: { id: row.id, userId, acceptance: "proposed" },
      data: { acceptance: decision }
    });
    if (changed.count === 0) throw new HttpError(400, `This share is already ${row.acceptance}`);

    await createDedupedNotifications(tx, [
      {
        userId: row.sharedExpense.ownerUserId,
        senderUserId: userId,
        type: decision === "accepted" ? "shared_expense_accepted" : "shared_expense_rejected",
        title: decision === "accepted" ? "Share accepted" : "Share rejected",
        message: `${userLabel(row.user!)} ${decision === "accepted" ? "accepted" : "rejected"} their share of ${row.sharedExpense.title}.`,
        metadata: { sharedExpenseId, transactionId: row.sharedExpense.transactionId, participantId: row.id }
      }
    ]);
    return row;
  });

  return getSharedExpenseById(userId, participant.sharedExpenseId);
}
