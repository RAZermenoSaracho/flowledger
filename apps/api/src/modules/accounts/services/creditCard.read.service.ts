import type { BillingPeriod, CreditCardBilling } from "@flowledger/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";
import type {
  CardEntry,
  LocalDate,
  PeriodOverride
} from "../types/creditCardBilling.types.js";
import {
  BILLING_PAGE_SIZE,
  buildCardBilling,
  toCardEntry
} from "../utils/creditCardBilling.js";
import { monthIndexOfKey } from "../utils/creditCardCycle.js";

const ledgerSelect = {
  type: true,
  accountId: true,
  transferToAccountId: true,
  accountAmount: true,
  destinationAmount: true,
  date: true,
  creditCardKind: true
} as const;

/**
 * Loads the ledger entries of several cards of one user with exactly two indexed queries (rows on the card, and transfers into it),
 * scoped by `userId`. Returns one entry list per requested account id (empty when it has no rows); entries are unsorted.
 */
export async function loadCardEntries(
  userId: string,
  accountIds: string[]
): Promise<Map<string, CardEntry[]>> {
  const entries = new Map<string, CardEntry[]>(
    accountIds.map((id) => [id, []])
  );
  if (accountIds.length === 0) return entries;

  const [own, incoming] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, accountId: { in: accountIds } },
      select: ledgerSelect
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: "transfer",
        transferToAccountId: { in: accountIds }
      },
      select: ledgerSelect
    })
  ]);

  for (const row of own)
    entries.get(row.accountId!)?.push(toCardEntry(row, row.accountId!));
  for (const row of incoming) {
    entries
      .get(row.transferToAccountId!)
      ?.push(toCardEntry(row, row.transferToAccountId!));
  }
  return entries;
}

function toLocalDate(value: Date | null): LocalDate | undefined {
  return value
    ? {
        y: value.getUTCFullYear(),
        m: value.getUTCMonth() + 1,
        d: value.getUTCDate()
      }
    : undefined;
}

/**
 * Loads the stored period overrides of several cards of one user with one query scoped by `userId`, on `db` (a transaction client when called inside a transaction).
 * Returns one override map (keyed by period `monthIndex`) per requested account id, empty when the card has none.
 */
export async function loadCardOverrides(
  userId: string,
  accountIds: string[],
  db: Prisma.TransactionClient = prisma
): Promise<Map<string, Map<number, PeriodOverride>>> {
  const result = new Map<string, Map<number, PeriodOverride>>(
    accountIds.map((id) => [id, new Map()])
  );
  if (accountIds.length === 0) return result;
  const rows = await db.creditCardPeriodOverride.findMany({
    where: { userId, accountId: { in: accountIds } }
  });
  for (const row of rows) {
    const override: PeriodOverride = {};
    const closingDate = toLocalDate(row.closingDate);
    const dueDate = toLocalDate(row.dueDate);
    if (closingDate) override.closingDate = closingDate;
    if (dueDate) override.dueDate = dueDate;
    result.get(row.accountId)?.set(row.monthIndex, override);
  }
  return result;
}

/**
 * Computes the billing projection of one of the user's credit cards for `GET /accounts/:id/credit-card`.
 * Throws a 404 when the account doesn't exist, isn't owned by `userId`, or isn't a `credit_card`.
 */
export async function getCreditCardBilling(
  userId: string,
  accountId: string,
  page: number,
  now: Date = new Date()
): Promise<CreditCardBilling> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId, type: "credit_card" }
  });
  if (!account) throw notFound("Account");

  const [entries, overrides] = await Promise.all([
    loadCardEntries(userId, [account.id]),
    loadCardOverrides(userId, [account.id])
  ]);
  return buildCardBilling({
    account,
    entries: entries.get(account.id) ?? [],
    overrides: overrides.get(account.id),
    now,
    page
  });
}

/**
 * Returns one billing period of an owned credit card by its `YYYY-MM` key, or `null` when the card has no such period.
 * Throws a 404 like {@link getCreditCardBilling}.
 */
export async function getBillingPeriod(
  userId: string,
  accountId: string,
  key: string,
  now: Date = new Date()
): Promise<BillingPeriod | null> {
  const first = await getCreditCardBilling(userId, accountId, 1, now);
  const newest = first.periods[0];
  if (!newest) return null;
  const position = monthIndexOfKey(newest.key) - monthIndexOfKey(key);
  if (position < 0 || position >= first.totalPeriods) return null;
  const page = Math.floor(position / BILLING_PAGE_SIZE) + 1;
  const billing =
    page === 1
      ? first
      : await getCreditCardBilling(userId, accountId, page, now);
  return billing.periods.find((period) => period.key === key) ?? null;
}
