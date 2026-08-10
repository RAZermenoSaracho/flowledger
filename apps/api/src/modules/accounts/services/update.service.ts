import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";

/** Updates an account's editable fields, throwing a 404 if it isn't owned by `userId`. */
export async function updateAccount(userId: string, id: string, body: any) {
  const existing = await prisma.account.findFirst({
    where: { id, userId }
  });
  if (!existing) throw notFound("Account");

  return prisma.account.update({
    where: { id: existing.id },
    data: body
  });
}

/** Marks an account archived, throwing a 404 if it isn't owned by `userId`. */
export async function archiveAccount(userId: string, id: string) {
  const existing = await prisma.account.findFirst({
    where: { id, userId }
  });
  if (!existing) throw notFound("Account");

  return prisma.account.update({
    where: { id: existing.id },
    data: { isArchived: true, archivedAt: new Date() }
  });
}

/** Un-archives a previously archived account, throwing a 404 if it isn't owned by `userId`. */
export async function restoreAccount(userId: string, id: string) {
  const existing = await prisma.account.findFirst({
    where: { id, userId }
  });
  if (!existing) throw notFound("Account");

  return prisma.account.update({
    where: { id: existing.id },
    data: { isArchived: false, archivedAt: null }
  });
}
