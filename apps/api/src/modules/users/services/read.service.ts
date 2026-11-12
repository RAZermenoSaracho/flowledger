import type { PublicUser } from "@flowledger/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { badRequest } from "../../../utils/httpError.js";
import { publicUserSelect, toPublicUser } from "../utils/publicUser.js";

/** Message for every refused invitation, identical for a block in either direction so it reveals nothing. */
export const cannotInviteMessage = "This user can't be invited.";

/**
 * Searches app users by exact username first, then case-insensitive username or public nickname prefix.
 * Never matches or returns email or name; excludes the caller and anyone blocked in either direction.
 * @returns at most `limit` public users.
 */
export async function searchUsers(userId: string, query: string, limit: number): Promise<PublicUser[]> {
  const raw = query.trim();
  const needle = raw.replace(/^@/, "").toLowerCase();
  if (!needle) return [];

  const visible: Prisma.UserWhereInput = {
    id: { not: userId },
    blocksMade: { none: { blockedId: userId } },
    blocksReceived: { none: { blockerId: userId } }
  };
  const exact = await prisma.user.findFirst({
    where: { ...visible, username: needle },
    select: publicUserSelect
  });
  const prefixed = await prisma.user.findMany({
    where: {
      ...visible,
      ...(exact ? { NOT: { id: exact.id } } : {}),
      OR: [
        { username: { startsWith: needle, mode: "insensitive" } },
        { nickname: { startsWith: raw, mode: "insensitive" } }
      ]
    },
    select: publicUserSelect,
    orderBy: { username: "asc" },
    take: exact ? limit - 1 : limit
  });
  return [...(exact ? [exact] : []), ...prefixed].map(toPublicUser);
}

/** Whether `username` (already normalized) is free for `userId`; the caller's own current username counts as available. */
export async function isUsernameAvailable(userId: string, username: string): Promise<boolean> {
  const owner = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  return !owner || owner.id === userId;
}

/** Fetches a user by id; throws if the user doesn't exist. */
export async function getCurrentUser(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

/** Lists the caller's blocks, newest first, each with the blocked user's public identity. */
export async function listBlocks(userId: string) {
  const blocks = await prisma.userBlock.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, blocked: { select: publicUserSelect } }
  });
  return blocks.map(({ blocked, ...block }) => ({ ...block, user: toPublicUser(blocked) }));
}

/** Whether a block exists between the two users in either direction. */
export async function isBlockedEither(
  userAId: string,
  userBId: string,
  client: Pick<Prisma.TransactionClient, "userBlock"> = prisma
): Promise<boolean> {
  const count = await client.userBlock.count({
    where: {
      OR: [
        { blockerId: userAId, blockedId: userBId },
        { blockerId: userBId, blockedId: userAId }
      ]
    }
  });
  return count > 0;
}

/** The subset of `candidateUserIds` that have a block with `userId` in either direction. */
export async function findBlockedEitherUserIds(
  userId: string,
  candidateUserIds: string[],
  client: Pick<Prisma.TransactionClient, "userBlock"> = prisma
): Promise<Set<string>> {
  if (candidateUserIds.length === 0) return new Set();
  const blocks = await client.userBlock.findMany({
    where: {
      OR: [
        { blockerId: userId, blockedId: { in: candidateUserIds } },
        { blockedId: userId, blockerId: { in: candidateUserIds } }
      ]
    },
    select: { blockerId: true, blockedId: true }
  });
  return new Set(blocks.map((block) => (block.blockerId === userId ? block.blockedId : block.blockerId)));
}

/** Throws the generic 400 "This user can't be invited." when any of `candidateUserIds` has a block with `userId` in either direction. */
export async function assertNoBlockedInvitees(
  userId: string,
  candidateUserIds: string[],
  client: Pick<Prisma.TransactionClient, "userBlock"> = prisma
): Promise<void> {
  const blocked = await findBlockedEitherUserIds(userId, candidateUserIds, client);
  if (blocked.size > 0) throw badRequest(cannotInviteMessage);
}
