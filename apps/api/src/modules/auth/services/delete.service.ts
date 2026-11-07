import { prisma } from "../../../db/prisma.js";
import { hashRefreshToken } from "../utils/tokens.js";

/** Revokes the stored refresh token matching `plaintextRefreshToken`, its predecessor, and any token issued from it, so a refresh still in flight can't outlive the logout; a no-op if the token doesn't exist. */
export async function revokeRefreshToken(plaintextRefreshToken: string) {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(plaintextRefreshToken) },
    select: { id: true, userId: true, previousTokenId: true }
  });

  if (!record) return;

  const ids = record.previousTokenId
    ? [record.id, record.previousTokenId]
    : [record.id];

  await prisma.refreshToken.updateMany({
    where: {
      userId: record.userId,
      revokedAt: null,
      OR: [{ id: { in: ids } }, { previousTokenId: record.id }]
    },
    data: { revokedAt: new Date() }
  });
}

/** Revokes every token issued from `tokenId`, directly or indirectly, including siblings from concurrent refreshes. */
export async function revokeDescendants(tokenId: string, userId: string) {
  let parentIds = [tokenId];

  while (parentIds.length > 0) {
    const children = await prisma.refreshToken.findMany({
      where: { userId, previousTokenId: { in: parentIds } },
      select: { id: true }
    });
    parentIds = children.map((child) => child.id);

    await prisma.refreshToken.updateMany({
      where: { id: { in: parentIds }, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }
}
