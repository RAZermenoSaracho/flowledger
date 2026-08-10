import bcrypt from "bcryptjs";
import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import { hashRefreshToken, signAccessToken } from "../utils/tokens.js";
import { issueRefreshToken } from "./create.service.js";

/** Verifies email/password against the stored hash and issues an access+refresh token pair; throws 401 on any mismatch (including a Google-only account with no password). */
export async function authenticateUser(input: {
  email: string;
  password: string;
}) {
  const user = await prisma.user.findUnique({
    where: { email: input.email }
  });
  const isValid = user?.passwordHash
    ? await bcrypt.compare(input.password, user.passwordHash)
    : false;

  if (!user || !isValid) {
    throw new HttpError(401, "Invalid email or password");
  }

  const refreshToken = await issueRefreshToken(user.id);
  return { token: signAccessToken(user), refreshToken, user };
}

/** Fetches a user by id, throwing if it doesn't exist. */
export async function getCurrentUser(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

/** Looks up an unrevoked, unexpired refresh token by its plaintext value; throws 401 if it doesn't match a live token. */
export async function getValidRefreshToken(plaintextRefreshToken: string) {
  const tokenHash = hashRefreshToken(plaintextRefreshToken);
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new HttpError(401, "Invalid or expired refresh token");
  }

  return record;
}
