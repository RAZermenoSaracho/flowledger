import { prisma } from "../../../db/prisma.js";
import { signAccessToken } from "../utils/tokens.js";
import { issueRefreshToken } from "./create.service.js";
import { getValidRefreshToken } from "./read.service.js";

/**
 * Issues a fresh access token and a successor refresh token in the same session mode; throws 401 if the presented token is invalid, revoked, or expired.
 *
 * The presented token stays valid until its successor is first used, so a client that never received the response, or a parallel tab, can still refresh. Its own predecessor is revoked here, because using it proves the client received it.
 */
export async function rotateRefreshToken(plaintextRefreshToken: string) {
  const record = await getValidRefreshToken(plaintextRefreshToken);

  const refreshToken = await issueRefreshToken(
    record.userId,
    record.persistent,
    record.id
  );

  if (record.previousTokenId) {
    await prisma.refreshToken.updateMany({
      where: { id: record.previousTokenId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  return { token: signAccessToken(record.user), refreshToken, user: record.user };
}
