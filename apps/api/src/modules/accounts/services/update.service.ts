import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";

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
