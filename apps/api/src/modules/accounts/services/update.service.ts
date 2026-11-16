import {
  HOLDING_ACCOUNT_TYPES,
  refineCreditCardAccount,
  type UpdateAccountInput
} from "@flowledger/shared";
import { z } from "zod";
import { prisma } from "../../../db/prisma.js";
import { badRequest, notFound } from "../../../utils/httpError.js";

const CARD_FIELDS = [
  "creditLimit",
  "statementClosingDay",
  "paymentDueRule",
  "paymentDueValue",
  "billingTimeZone",
  "annualInterestRate"
] as const;

const mergedCardRulesSchema = z.object({}).passthrough().superRefine(refineCreditCardAccount);

/**
 * Updates an account's editable fields, throwing a 404 if it isn't owned by `userId`, a 400 naming `currency` when the currency changes
 * while any transaction references the account, and a 400 naming the offending field when the merged stored + patched account breaks the credit-card rules.
 * Changing to a type that cannot hold holdings while holdings exist is a 400 naming `type`. Moving the type away from `credit_card` clears the six card fields.
 */
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

  if (
    body.type !== undefined &&
    !(HOLDING_ACCOUNT_TYPES as readonly string[]).includes(body.type) &&
    (await prisma.holding.count({ where: { accountId: existing.id, userId } })) > 0
  ) {
    const message = "Remove the account's holdings before changing it to a type that cannot hold them";
    throw badRequest(message, { issues: { formErrors: [], fieldErrors: { type: [message] } } });
  }

  const leavesCard =
    body.type !== undefined && body.type !== "credit_card" && existing.type === "credit_card";
  const cleared = leavesCard ? Object.fromEntries(CARD_FIELDS.map((field) => [field, null])) : {};
  const patch = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
  const merged = { ...existing, ...cleared, ...patch };

  const parsed = mergedCardRulesSchema.safeParse(merged);
  if (!parsed.success) {
    const { formErrors, fieldErrors } = parsed.error.flatten();
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid account", {
      issues: { formErrors, fieldErrors }
    });
  }

  return prisma.account.update({
    where: { id: existing.id },
    data: { ...cleared, ...body }
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
