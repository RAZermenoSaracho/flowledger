import bcrypt from "bcryptjs";
import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import { signToken } from "../utils/tokens.js";

/** Verifies email/password against the stored hash and issues a token; throws 401 on any mismatch (including a Google-only account with no password). */
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

  return { token: signToken(user), user };
}

/** Fetches a user by id, throwing if it doesn't exist. */
export async function getCurrentUser(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}
