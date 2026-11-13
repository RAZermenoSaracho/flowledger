import type { UpdateAccountInput } from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { badRequest, notFound } from "../../../utils/httpError.js";

/** Updates an account's editable fields, throwing a 404 if it isn't owned by `userId` and a 400 naming `currency` when the currency changes while any transaction references the account. */
export async function updateAccount(userId: string, id: string, body: UpdateAccountInput) {
  const existing = await prisma.account.findFirst({
    where: { id, userId }
  });
  if (!existing) throw notFound("Account");

  if (body.currency !== undefined && body.currency !== existing.currency) {
    const referenced = await prisma.transaction.findFirst({
      where: { OR: [{ accountId: existing.id }, { transferToAccountId: existing.id }] },
      select: { id: true }
    });
    if (referenced) {
      const message = "Account currency cannot change once it has transactions";
      throw badRequest(message, {
        issues: { formErrors: [], fieldErrors: { currency: [message] } }
      });
    }
  }

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
