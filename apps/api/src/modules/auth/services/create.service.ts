import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import { generateRefreshToken, signAccessToken } from "../utils/tokens.js";
import bcrypt from "bcryptjs";

/**
 * Persists a new refresh token for `userId`, returning what the session cookies need. `previousTokenId` links a rotated token to the one it replaces.
 *
 * Also deletes the user's expired tokens. Revoked but unexpired ones stay, so a replay can still be recognized, and a failed delete never fails the sign-in.
 */
export async function issueRefreshToken(
  userId: string,
  persistent: boolean,
  previousTokenId?: string
) {
  const { token, tokenHash, expiresAt } = generateRefreshToken(persistent);
  await prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt, persistent, previousTokenId }
  });
  try {
    await prisma.refreshToken.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  } catch (error) {
    console.error("Failed to delete expired refresh tokens", error);
  }
  return { token, expiresAt, persistent };
}

/** Creates a new user with a hashed password and issues an access+refresh token pair; throws 409 if the email is already registered. */
export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (existing) {
    throw new HttpError(409, "Email is already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash
    }
  });

  const refreshToken = await issueRefreshToken(user.id, true);
  return { token: signAccessToken(user), refreshToken, user };
}
