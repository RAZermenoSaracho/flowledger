import { prisma } from "../../../db/prisma.js";

export async function createAccount(userId: string, body: any) {
  return prisma.account.create({
    data: { ...body, userId }
  });
}
