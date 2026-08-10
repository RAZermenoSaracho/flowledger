import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import { generateRefreshToken, signAccessToken } from "../utils/tokens.js";
import bcrypt from "bcryptjs";

/** Persists a new refresh token for `userId`, returning its plaintext value and expiry. */
export async function issueRefreshToken(userId: string) {
  const { token, tokenHash, expiresAt } = generateRefreshToken();
  await prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  return { token, expiresAt };
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

  const refreshToken = await issueRefreshToken(user.id);
  return { token: signAccessToken(user), refreshToken, user };
}
