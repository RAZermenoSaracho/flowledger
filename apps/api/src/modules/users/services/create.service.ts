import { prisma } from "../../../db/prisma.js";
import { badRequest } from "../../../utils/httpError.js";
import { publicUserSelect, toPublicUser } from "../utils/publicUser.js";

/**
 * Blocks `blockedId` for `blockerId`. Idempotent. In the same transaction the blocker's `proposed`
 * shares on the blocked user's expenses become `rejected`; accepted shares, payments, settlements
 * and Group membership are untouched.
 * @throws 400 when blocking oneself or an unknown user.
 */
export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw badRequest("You can't block yourself");

  const target = await prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } });
  if (!target) throw badRequest("User does not exist");

  const block = await prisma.$transaction(async (tx) => {
    const created = await tx.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
      select: { id: true, createdAt: true, blocked: { select: publicUserSelect } }
    });
    await tx.sharedExpenseParticipant.updateMany({
      where: { userId: blockerId, acceptance: "proposed", sharedExpense: { ownerUserId: blockedId } },
      data: { acceptance: "rejected" }
    });
    return created;
  });

  const { blocked, ...rest } = block;
  return { ...rest, user: toPublicUser(blocked) };
}
