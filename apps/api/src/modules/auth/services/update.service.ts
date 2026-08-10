import { prisma } from "../../../db/prisma.js";
import { signAccessToken } from "../utils/tokens.js";
import { issueRefreshToken } from "./create.service.js";
import { getValidRefreshToken } from "./read.service.js";

/** Validates and revokes `plaintextRefreshToken`, then issues a fresh access token and rotated refresh token for its owner; throws 401 if the refresh token is invalid, revoked, or expired. */
export async function rotateRefreshToken(plaintextRefreshToken: string) {
  const record = await getValidRefreshToken(plaintextRefreshToken);

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() }
  });

  const refreshToken = await issueRefreshToken(record.userId);
  return { token: signAccessToken(record.user), refreshToken, user: record.user };
}
