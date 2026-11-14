import type { CreditCardBilling } from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";
import type { CardEntry } from "../types/creditCardBilling.types.js";
import { buildCardBilling, toCardEntry } from "../utils/creditCardBilling.js";

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
  const entries = new Map<string, CardEntry[]>(accountIds.map((id) => [id, []]));
  if (accountIds.length === 0) return entries;

  const [own, incoming] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, accountId: { in: accountIds } },
      select: ledgerSelect
    }),
    prisma.transaction.findMany({
      where: { userId, type: "transfer", transferToAccountId: { in: accountIds } },
      select: ledgerSelect
    })
  ]);

  for (const row of own) entries.get(row.accountId!)?.push(toCardEntry(row, row.accountId!));
  for (const row of incoming) {
    entries.get(row.transferToAccountId!)?.push(toCardEntry(row, row.transferToAccountId!));
  }
  return entries;
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

  const entries = await loadCardEntries(userId, [account.id]);
  return buildCardBilling({ account, entries: entries.get(account.id) ?? [], now, page });
}
