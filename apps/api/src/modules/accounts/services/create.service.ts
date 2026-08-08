import { prisma } from "../../../db/prisma.js";

/** Creates an account row owned by `userId`. */
export async function createAccount(userId: string, body: any) {
  return prisma.account.create({
    data: { ...body, userId }
  });
}
