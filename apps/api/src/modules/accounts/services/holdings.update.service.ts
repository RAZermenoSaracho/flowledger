import {
  exceedsCurrencyPrecision,
  HOLDING_ACCOUNT_TYPES,
  MANUALLY_PRICED_HOLDING_KINDS,
  type AccountHoldings,
  type HoldingsChangeSetInput,
  type HoldingUpsertInput
} from "@flowledger/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { badRequest, notFound } from "../../../utils/httpError.js";
import { refreshSecurityQuotes } from "../../currencies/providers/twelveData/services/quotes.service.js";
import type { SecurityListing } from "../../currencies/providers/twelveData/types/twelveData.types.js";
import type { ExistingHolding } from "../types/holdings.types.js";
import { getAccountHoldings } from "./holdings.read.service.js";

const MAX_HOLDINGS_PER_ACCOUNT = 200;
const REFRESH_DEADLINE_MS = 8000;
const DUPLICATE_MESSAGE = "An account can hold each asset only once; that kind and code already exists";

/** Runs a best-effort quote refresh, waiting at most {@link REFRESH_DEADLINE_MS}; a failure or timeout never reaches the caller. */
async function refreshWithinDeadline(listings: SecurityListing[]): Promise<void> {
  if (listings.length === 0) return;
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, REFRESH_DEADLINE_MS);
  });
  try {
    await Promise.race([refreshSecurityQuotes(listings).catch(() => undefined), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function fieldError(field: string, message: string) {
  return badRequest(message, { issues: { formErrors: [], fieldErrors: { [field]: [message] } } });
}

/** Builds the Prisma `update` data for one upsert item against the stored holding, enforcing the rules that depend on stored kind/code. */
function updateData(item: HoldingUpsertInput, stored: ExistingHolding, now: Date): Prisma.HoldingUpdateInput {
  const data: Prisma.HoldingUpdateInput = {};
  if (item.unit !== undefined && stored.kind !== "other") throw fieldError("unit", "Only other holdings accept a unit");
  if (stored.kind === "other" && item.name === null) throw fieldError("name", "Other holdings require a name");
  if (item.name !== undefined) data.name = item.name;
  if (item.unit !== undefined) data.unit = item.unit;
  if (
    item.manualUnitPrice === null &&
    (MANUALLY_PRICED_HOLDING_KINDS as readonly string[]).includes(stored.kind) &&
    !stored.exchange
  ) {
    throw fieldError("manualUnitPrice", "This asset requires a manual price");
  }

  if (item.quantity !== undefined) {
    if (stored.kind === "fiat" && exceedsCurrencyPrecision(item.quantity, stored.code!)) {
      throw fieldError("quantity", `${stored.code} allows fewer decimals than ${item.quantity} has`);
    }
    data.quantity = new Prisma.Decimal(item.quantity);
  }

  if (item.manualUnitPrice === null) {
    Object.assign(data, { manualUnitPrice: null, manualPriceCurrency: null, manualPricedAt: null });
  } else if (
    item.manualUnitPrice !== undefined ||
    item.manualPriceCurrency !== undefined ||
    item.manualPricedAt !== undefined
  ) {
    if (stored.kind === "fiat") {
      throw fieldError("manualUnitPrice", "Cash holdings are valued at par and take no manual price");
    }
    if (item.manualUnitPrice === undefined && !stored.manualUnitPrice) {
      throw fieldError("manualUnitPrice", "Set a manual unit price together with its currency");
    }
    if (item.manualUnitPrice !== undefined) data.manualUnitPrice = new Prisma.Decimal(item.manualUnitPrice);
    if (item.manualPriceCurrency !== undefined) data.manualPriceCurrency = item.manualPriceCurrency;
    data.manualPricedAt = item.manualPricedAt ?? now;
  }
  return data;
}

/**
 * Applies an atomic holdings change set to an account in one transaction: creates items without `id`, updates those with `id`
 * (quantity and/or manual valuation; a quantity-only edit keeps `manualPricedAt`), and deletes `remove` ids. Unmentioned holdings are untouched.
 * 404 for a foreign account or an id not belonging to this account and user; 400 when the account type cannot hold holdings,
 * on a fiat precision or manual-price violation, or a duplicate `(kind, code)`. Crypto accounts accept crypto only;
 * incompatible stored holdings may be removed but not updated. Unlinked stock/ETF and other require manual prices;
 * provider-linked stock/ETF (created with `exchange` + `quoteCurrency`, immutable afterwards) may omit or clear them.
 * A second holding of the same `(kind, code, exchange)`, or unlinked `(kind, code)`, is rejected with the duplicate 400: the
 * pre-check gives early feedback and the database unique indexes (including a partial one for NULL exchanges) decide concurrent
 * creates, whose P2002 maps to the same 400.
 * After the commit, listings that became auto-priced (created linked without a manual price, or manual price cleared) get a
 * best-effort quote refresh bounded to a short deadline; quantity-only edits never refresh and a refresh failure never fails the save.
 * Returns the same body as `getAccountHoldings`.
 */
export async function applyHoldingChanges(
  userId: string,
  accountId: string,
  changeSet: HoldingsChangeSetInput
): Promise<AccountHoldings> {
  const now = new Date();
  const toRefresh: SecurityListing[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      const account = await tx.account.findFirst({
        where: { id: accountId, userId },
        select: { id: true, type: true }
      });
      if (!account) throw notFound("Account");
      if (!(HOLDING_ACCOUNT_TYPES as readonly string[]).includes(account.type)) {
        throw badRequest("Only investment and crypto accounts can have holdings");
      }

      const ids = [...changeSet.upsert.flatMap((item) => (item.id ? [item.id] : [])), ...changeSet.remove];
      if (changeSet.upsert.some((item) => item.id && changeSet.remove.includes(item.id))) {
        throw badRequest("A holding cannot be both updated and removed in one change set");
      }
      const stored = ids.length
        ? await tx.holding.findMany({
            where: { id: { in: ids }, accountId, userId },
            select: { id: true, kind: true, code: true, manualUnitPrice: true, exchange: true, quoteCurrency: true }
          })
        : [];
      const storedById = new Map(stored.map((holding) => [holding.id, holding]));
      if (new Set(ids).size !== storedById.size) throw notFound("Holding");

      for (const item of changeSet.upsert) {
        const kind = item.id ? storedById.get(item.id)!.kind : item.kind;
        if (account.type === "crypto" && kind !== "crypto") {
          throw fieldError("kind", "This asset type is not allowed in a crypto account; remove it or change the account type to Investment");
        }
      }

      const creates = changeSet.upsert.filter((item) => !item.id).length;
      if (creates > 0) {
        const existing = await tx.holding.count({ where: { accountId, userId } });
        if (existing - new Set(changeSet.remove).size + creates > MAX_HOLDINGS_PER_ACCOUNT) {
          throw badRequest(`An account can have at most ${MAX_HOLDINGS_PER_ACCOUNT} holdings`);
        }
      }

      if (changeSet.remove.length > 0) {
        await tx.holding.deleteMany({ where: { id: { in: changeSet.remove }, accountId, userId } });
      }

      for (const item of changeSet.upsert) {
        if (item.id) {
          const current = storedById.get(item.id)!;
          await tx.holding.update({
            where: { id: item.id, accountId, userId },
            data: updateData(item, current, now)
          });
          if (item.manualUnitPrice === null && current.exchange && current.code) {
            toRefresh.push({ symbol: current.code, exchange: current.exchange, quoteCurrency: current.quoteCurrency });
          }
        } else {
          if (item.code && !item.exchange) {
            const duplicate = await tx.holding.findFirst({
              where: { accountId, userId, kind: item.kind!, code: item.code, exchange: null },
              select: { id: true }
            });
            if (duplicate) throw badRequest(DUPLICATE_MESSAGE);
          }
          if (item.exchange && item.code && !item.manualUnitPrice) {
            toRefresh.push({ symbol: item.code, exchange: item.exchange, quoteCurrency: item.quoteCurrency ?? null });
          }
          await tx.holding.create({
            data: {
              userId,
              accountId,
              kind: item.kind!,
              code: item.code ?? null,
              name: item.name ?? null,
              unit: item.unit ?? null,
              exchange: item.exchange ?? null,
              quoteCurrency: item.quoteCurrency ?? null,
              quantity: new Prisma.Decimal(item.quantity!),
              ...(item.manualUnitPrice
                ? {
                    manualUnitPrice: new Prisma.Decimal(item.manualUnitPrice),
                    manualPriceCurrency: item.manualPriceCurrency,
                    manualPricedAt: item.manualPricedAt ?? now
                  }
                : {})
            }
          });
        }
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequest(DUPLICATE_MESSAGE);
    }
    throw error;
  }

  await refreshWithinDeadline(toRefresh);
  return getAccountHoldings(userId, accountId);
}

/**
 * Refreshes the quotes of an account's provider-linked stock/ETF holdings that have no manual price (only those due are
 * fetched, see `refreshSecurityQuotes`) and returns the same body as `getAccountHoldings`. 404 when the account is not the user's.
 * Provider failures never fail the call: they only leave the stored quotes unchanged.
 */
export async function refreshAccountHoldings(userId: string, accountId: string): Promise<AccountHoldings> {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
  if (!account) throw notFound("Account");
  const linked = await prisma.holding.findMany({
    where: { accountId, userId, exchange: { not: null }, code: { not: null }, manualUnitPrice: null },
    select: { code: true, exchange: true, quoteCurrency: true }
  });
  await refreshWithinDeadline(
    linked.map((row) => ({ symbol: row.code!, exchange: row.exchange!, quoteCurrency: row.quoteCurrency }))
  );
  return getAccountHoldings(userId, accountId);
}
