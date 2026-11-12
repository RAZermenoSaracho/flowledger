import { prisma } from "../../../db/prisma.js";

/** Removes the caller's block on `blockedId`. Idempotent; restores nothing, so rejected shares stay rejected. */
export async function unblockUser(blockerId: string, blockedId: string) {
  await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
}
