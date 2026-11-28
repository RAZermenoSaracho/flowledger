import {
  HOLDING_ACCOUNT_TYPES,
  refineCreditCardAccount,
  type UpdateAccountInput
} from "@flowledger/shared";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../../db/prisma.js";
import { badRequest, notFound } from "../../../utils/httpError.js";
import type { CardBillingAccount } from "../types/creditCardBilling.types.js";
import { toCycleConfig } from "../utils/creditCardBilling.js";
import { validateCycleSequence } from "../utils/creditCardCycle.js";
import { loadCardOverrides } from "./creditCard.read.service.js";
import { mapSerializationConflict } from "./creditCard.update.service.js";

const CARD_FIELDS = [
  "creditLimit",
  "statementClosingDay",
  "paymentDueRule",
  "paymentDueValue",
  "billingTimeZone",
  "annualInterestRate"
] as const;

const CYCLE_FIELDS = [
  "statementClosingDay",
  "paymentDueRule",
  "paymentDueValue",
  "billingTimeZone"
] as const;

const mergedCardRulesSchema = z
  .object({})
  .passthrough()
  .superRefine(refineCreditCardAccount);

/**
 * Updates an account's editable fields, throwing a 404 if it isn't owned by `userId`, a 400 naming `currency` when the currency changes
 * while any transaction references the account, and a 400 naming the offending field when the merged stored + patched account breaks the credit-card rules.
 * Changing to a type that cannot hold holdings while holdings exist is a 400 naming `type`. Moving the type away from `credit_card` clears the six card fields
 * and deletes the card's billing period overrides. A change of the card's cycle fields is a 400 naming the period when it would invalidate an existing period override;
 * that check and the write run in one Serializable transaction, and a serialization failure is a 409.
 */
export async function updateAccount(
  userId: string,
  id: string,
  body: UpdateAccountInput
) {
  const existing = await prisma.account.findFirst({
    where: { id, userId }
  });
  if (!existing) throw notFound("Account");

  if (body.currency !== undefined && body.currency !== existing.currency) {
    const referenced = await prisma.transaction.findFirst({
      where: {
        OR: [{ accountId: existing.id }, { transferToAccountId: existing.id }]
      },
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
    (await prisma.holding.count({
      where: { accountId: existing.id, userId }
    })) > 0
  ) {
    const message =
      "Remove the account's holdings before changing it to a type that cannot hold them";
    throw badRequest(message, {
      issues: { formErrors: [], fieldErrors: { type: [message] } }
    });
  }

  if (
    body.type === "crypto" &&
    existing.type !== "crypto" &&
    (await prisma.holding.count({
      where: { accountId: existing.id, userId, kind: { not: "crypto" } }
    })) > 0
  ) {
    const message =
      "Remove non-crypto holdings before changing the account type to Crypto";
    throw badRequest(message, {
      issues: { formErrors: [], fieldErrors: { type: [message] } }
    });
  }

  const leavesCard =
    body.type !== undefined &&
    body.type !== "credit_card" &&
    existing.type === "credit_card";
  const cleared = leavesCard
    ? Object.fromEntries(CARD_FIELDS.map((field) => [field, null]))
    : {};
  const patch = Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined)
  );
  const merged = { ...existing, ...cleared, ...patch };

  const parsed = mergedCardRulesSchema.safeParse(merged);
  if (!parsed.success) {
    const { formErrors, fieldErrors } = parsed.error.flatten();
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid account", {
      issues: { formErrors, fieldErrors }
    });
  }

  if (
    existing.type === "credit_card" &&
    !leavesCard &&
    CYCLE_FIELDS.some((field) => body[field] !== undefined)
  ) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const overrides = (
            await loadCardOverrides(userId, [existing.id], tx)
          ).get(existing.id)!;
          const config =
            overrides.size > 0
              ? toCycleConfig(merged as CardBillingAccount, overrides)
              : null;
          const problem = config
            ? validateCycleSequence(
                config,
                [...overrides.keys()].flatMap((index) => [
                  index - 1,
                  index,
                  index + 1
                ])
              )
            : null;
          if (problem) {
            throw badRequest(
              `${problem}. Reset the period's adjusted dates before changing the card's billing cycle`
            );
          }
          return tx.account.update({
            where: { id: existing.id },
            data: { ...cleared, ...body }
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      throw mapSerializationConflict(error);
    }
  }

  if (leavesCard) {
    const [, updated] = await prisma.$transaction([
      prisma.creditCardPeriodOverride.deleteMany({
        where: { accountId: existing.id, userId }
      }),
      prisma.account.update({
        where: { id: existing.id },
        data: { ...cleared, ...body }
      })
    ]);
    return updated;
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
