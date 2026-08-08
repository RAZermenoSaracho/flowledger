import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";

/** Deletes an account owned by `userId`, throwing a 404 if it doesn't exist or belongs to someone else. */
export async function deleteAccount(userId: string, id: string) {
  const existing = await prisma.account.findFirst({
    where: { id, userId }
  });
  if (!existing) throw notFound("Account");

  await prisma.account.delete({ where: { id: existing.id } });
}
