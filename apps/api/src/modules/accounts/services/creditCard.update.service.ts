import type {
  BillingPeriod,
  UpdateBillingPeriodInput
} from "@flowledger/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { badRequest, conflict, notFound } from "../../../utils/httpError.js";
import type {
  LocalDate,
  PeriodOverride
} from "../types/creditCardBilling.types.js";
import { toCycleConfig } from "../utils/creditCardBilling.js";
import {
  monthIndexOfKey,
  periodIndexContaining,
  validateCycleSequence
} from "../utils/creditCardCycle.js";
import {
  getBillingPeriod,
  loadCardOverrides
} from "./creditCard.read.service.js";

function parseDate(value: string): LocalDate {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

function toDbDate(date: LocalDate | undefined) {
  return date ? new Date(Date.UTC(date.y, date.m - 1, date.d)) : null;
}

/** Applies a patch field: absent keeps `current`, `null` resets to the default (`undefined`), a string sets it. */
function patchDate(
  current: LocalDate | undefined,
  value: string | null | undefined
) {
  if (value === undefined) return current;
  return value === null ? undefined : parseDate(value);
}

/**
 * Sets or resets (null) the closing and/or due date of one billing period of an owned credit card, then returns the recomputed period.
 * Overrides are pure billing inputs: no ledger row or balance is touched. Throws a 404 when the card isn't owned by `userId`, and a 400 when
 * the card has no cycle, the period is outside the first-to-open range, or the new dates would break the period sequence (see `validateCycleSequence`).
 * The row is deleted when neither date remains overridden. The validation and write run in one Serializable transaction, so concurrent edits cannot jointly leave an invalid sequence; a serialization failure is a 409.
 */
export async function updateBillingPeriodOverride(
  userId: string,
  accountId: string,
  key: string,
  body: UpdateBillingPeriodInput,
  now: Date = new Date()
): Promise<BillingPeriod> {
  const monthIndex = monthIndexOfKey(key);

  try {
    await prisma.$transaction(
      async (tx) => {
        const account = await tx.account.findFirst({
          where: { id: accountId, userId, type: "credit_card" }
        });
        if (!account) throw notFound("Account");

        const overrides = (
          await loadCardOverrides(userId, [accountId], tx)
        ).get(accountId)!;
        const config = toCycleConfig(account, overrides);
        if (!config)
          throw badRequest(
            "Configure the card's billing cycle before adjusting periods"
          );

        const [firstRow, firstIncoming] = await Promise.all([
          tx.transaction.findFirst({
            where: { userId, accountId },
            orderBy: { date: "asc" },
            select: { date: true }
          }),
          tx.transaction.findFirst({
            where: { userId, type: "transfer", transferToAccountId: accountId },
            orderBy: { date: "asc" },
            select: { date: true }
          })
        ]);
        const earliest = [
          account.createdAt,
          firstRow?.date,
          firstIncoming?.date
        ]
          .filter((date): date is Date => date != null)
          .reduce((min, date) => (date < min ? date : min));
        if (
          monthIndex > periodIndexContaining(config, now) ||
          monthIndex < periodIndexContaining(config, earliest)
        ) {
          throw badRequest(
            `Period ${key} is outside the card's billing periods`
          );
        }

        const current = overrides.get(monthIndex) ?? {};
        const next: PeriodOverride = {};
        const closingDate = patchDate(current.closingDate, body.closingDate);
        const dueDate = patchDate(current.dueDate, body.dueDate);
        if (closingDate) next.closingDate = closingDate;
        if (dueDate) next.dueDate = dueDate;

        const nextOverrides = new Map(overrides);
        if (closingDate || dueDate) nextOverrides.set(monthIndex, next);
        else nextOverrides.delete(monthIndex);
        const problem = validateCycleSequence(
          { ...config, overrides: nextOverrides },
          [monthIndex - 1, monthIndex, monthIndex + 1]
        );
        if (problem) throw badRequest(problem);

        if (!closingDate && !dueDate) {
          await tx.creditCardPeriodOverride.deleteMany({
            where: { accountId, userId, monthIndex }
          });
          return;
        }
        const data = {
          closingDate: toDbDate(closingDate),
          dueDate: toDbDate(dueDate)
        };
        await tx.creditCardPeriodOverride.upsert({
          where: { accountId_monthIndex: { accountId, monthIndex } },
          create: { userId, accountId, monthIndex, ...data },
          update: data
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw conflict("Billing dates changed at the same time. Please retry");
    }
    throw error;
  }

  const period = await getBillingPeriod(userId, accountId, key, now);
  if (!period)
    throw badRequest(`Period ${key} is outside the card's billing periods`);
  return period;
}
