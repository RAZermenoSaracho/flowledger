import bcrypt from "bcryptjs";
import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import { signToken } from "../utils/tokens.js";

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

export async function getCurrentUser(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}
