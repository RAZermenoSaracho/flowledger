import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import { signToken } from "../utils/tokens.js";
import bcrypt from "bcryptjs";

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

  return { token: signToken(user), user };
}
