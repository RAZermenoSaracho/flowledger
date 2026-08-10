import { prisma } from "../../../db/prisma.js";
import { hashRefreshToken } from "../utils/tokens.js";

/** Revokes the stored refresh token matching `plaintextRefreshToken`, if any; a no-op if it doesn't exist or is already revoked. */
export async function revokeRefreshToken(plaintextRefreshToken: string) {
  const tokenHash = hashRefreshToken(plaintextRefreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}
