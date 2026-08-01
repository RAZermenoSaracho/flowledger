import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";

export async function deleteAccount(userId: string, id: string) {
  const existing = await prisma.account.findFirst({
    where: { id, userId }
  });
  if (!existing) throw notFound("Account");

  await prisma.account.delete({ where: { id: existing.id } });
}
