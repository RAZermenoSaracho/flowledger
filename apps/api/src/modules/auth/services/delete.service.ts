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
