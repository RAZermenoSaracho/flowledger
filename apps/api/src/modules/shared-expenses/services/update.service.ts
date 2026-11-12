import type { UpdateSharedExpenseInput } from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { HttpError, notFound } from "../../../utils/httpError.js";
import { createDedupedNotifications } from "../../notifications/services/create.service.js";
import { publicUserSelect, publicizeUsers, userLabel } from "../../users/utils/publicUser.js";
import { fieldError } from "../utils/shareGuards.js";
import { legacyParticipantsToSharing } from "../utils/sharingInput.js";
import { applySharedExpenseToTransaction, sharedExpenseResponseInclude } from "./apply.service.js";
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
      return publicizeUsers(
        await tx.sharedExpense.update({
          where: { id: existing.id },
          data: { status: input.status },
          include: sharedExpenseResponseInclude
        })
      );
    }
    return updated!;
  });
}

/**
 * The participant `userId` accepts or rejects their own `proposed` allocations of a shared expense. With
 * `participantId` only that allocation is answered (it must be the caller's, else 404; not `proposed`, else 400);
 * without it every `proposed` allocation of the caller on that expense is answered (none, 400). Scoped by
 * `sharedExpenseId` and `userId`, so the owner and other users get 404. Notifies the owner once per allocation.
 * @returns the shared expense as the participant sees it.
 */
export async function respondToSharedExpense(
  userId: string,
  sharedExpenseId: string,
  decision: "accepted" | "rejected",
  participantId?: string
) {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.sharedExpenseParticipant.findMany({
      where: { sharedExpenseId, userId, ...(participantId ? { id: participantId } : {}) },
      include: {
        sharedExpense: { select: { ownerUserId: true, title: true, transactionId: true } },
        user: { select: publicUserSelect }
      },
      orderBy: { createdAt: "asc" }
    });
    if (rows.length === 0) throw notFound("Shared expense");
    const targets = participantId ? rows : rows.filter((row) => row.acceptance === "proposed");
    if (targets.length === 0) throw new HttpError(400, `This share is already ${rows[0]!.acceptance}`);

    for (const row of targets) {
      const changed = await tx.sharedExpenseParticipant.updateMany({
        where: { id: row.id, userId, acceptance: "proposed" },
        data: { acceptance: decision }
      });
      if (changed.count === 0) throw new HttpError(400, `This share is already ${row.acceptance}`);
    }

    await createDedupedNotifications(
      tx,
      targets.map((row) => ({
        userId: row.sharedExpense.ownerUserId,
        senderUserId: userId,
        type: decision === "accepted" ? ("shared_expense_accepted" as const) : ("shared_expense_rejected" as const),
        title: decision === "accepted" ? "Share accepted" : "Share rejected",
        message: `${userLabel(row.user!)} ${decision === "accepted" ? "accepted" : "rejected"} their share of ${row.sharedExpense.title}.`,
        metadata: { sharedExpenseId, transactionId: row.sharedExpense.transactionId, participantId: row.id }
      }))
    );
  });

  return getSharedExpenseById(userId, sharedExpenseId);
}
