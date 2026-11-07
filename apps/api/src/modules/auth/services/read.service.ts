import bcrypt from "bcryptjs";
import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import { hashRefreshToken, signAccessToken } from "../utils/tokens.js";
import { issueRefreshToken } from "./create.service.js";
import { revokeDescendants } from "./delete.service.js";

const REPLAY_GRACE_PERIOD_MS = 60 * 1000;
/** A bcrypt hash of a discarded random value, so an unknown email costs the same as a wrong password. */
const DUMMY_PASSWORD_HASH = "$2a$12$KN69R0xZoOzeOtBPnpODA.rZjeg0uthwGMkKeoXOUc/v92.bzXAEO";

/** Verifies email/password against the stored hash and issues an access+refresh token pair; throws 401 on any mismatch (including a Google-only account with no password). */
export async function authenticateUser(input: {
  email: string;
  password: string;
  keepLoggedIn: boolean;
}) {
  const user = await prisma.user.findUnique({
    where: { email: input.email }
  });
  const isValid = await bcrypt.compare(
    input.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH
  );

  if (!user?.passwordHash || !isValid) {
    throw new HttpError(401, "Invalid email or password");
  }

  const refreshToken = await issueRefreshToken(user.id, input.keepLoggedIn);
  return { token: signAccessToken(user), refreshToken, user };
}

/** Fetches a user by id, throwing if it doesn't exist. */
export async function getCurrentUser(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

/**
 * Looks up an unrevoked, unexpired refresh token by its plaintext value; throws 401 if it doesn't match a live token.
 *
 * A token revoked more than a minute ago is a replay, so its descendants are revoked too. Inside that minute it may just be a request in flight during a rotation, which must not end a real session.
 */
export async function getValidRefreshToken(plaintextRefreshToken: string) {
  const tokenHash = hashRefreshToken(plaintextRefreshToken);
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (record?.revokedAt && Date.now() - record.revokedAt.getTime() > REPLAY_GRACE_PERIOD_MS) {
    await revokeDescendants(record.id, record.userId);
  }

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new HttpError(401, "Invalid or expired refresh token");
  }

  return record;
}
