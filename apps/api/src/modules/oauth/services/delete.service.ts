import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";
import { hashToken } from "../utils/tokens.js";

/** Revokes a grant by id with no ownership check; only for internal reuse/replay detection. */
export async function revokeGrantById(id: string) {
  await prisma.oAuthGrant.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

/** RFC 7009: revokes the grant that owns `token` if it belongs to `clientId`; unknown or foreign tokens are silently ignored. */
export async function revokeToken(clientId: string, token: string) {
  const hash = hashToken(token);
  await prisma.oAuthGrant.updateMany({
    where: {
      clientId,
      revokedAt: null,
      OR: [{ accessTokenHash: hash }, { refreshTokenHash: hash }, { prevRefreshTokenHash: hash }]
    },
    data: { revokedAt: new Date() }
  });
}

/** Revokes the user's own grant immediately; idempotent when already revoked, 404 when it is not theirs. */
export async function revokeOAuthGrant(userId: string, id: string) {
  const { count } = await prisma.oAuthGrant.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });

  if (count === 0) {
    const existing = await prisma.oAuthGrant.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw notFound("Connected app");
  }
}
