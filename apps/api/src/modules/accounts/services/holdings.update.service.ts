import {
  exceedsCurrencyPrecision,
  HOLDING_ACCOUNT_TYPES,
  type AccountHoldings,
  type HoldingsChangeSetInput,
  type HoldingUpsertInput
} from "@flowledger/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { badRequest, notFound } from "../../../utils/httpError.js";
import { getAccountHoldings } from "./holdings.read.service.js";

const MAX_HOLDINGS_PER_ACCOUNT = 200;

type ExistingHolding = { id: string; kind: "crypto" | "fiat"; code: string; manualUnitPrice: Prisma.Decimal | null };

function fieldError(field: string, message: string) {
  return badRequest(message, { issues: { formErrors: [], fieldErrors: { [field]: [message] } } });
}

/** Builds the Prisma `update` data for one upsert item against the stored holding, enforcing the rules that depend on stored kind/code. */
function updateData(item: HoldingUpsertInput, stored: ExistingHolding, now: Date): Prisma.HoldingUpdateInput {
  const data: Prisma.HoldingUpdateInput = {};

  if (item.quantity !== undefined) {
    if (stored.kind === "fiat" && exceedsCurrencyPrecision(item.quantity, stored.code)) {
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
 * on a fiat precision or manual-price violation, or a duplicate `(kind, code)`. Returns the same body as `getAccountHoldings`.
 */
export async function applyHoldingChanges(
  userId: string,
  accountId: string,
  changeSet: HoldingsChangeSetInput
): Promise<AccountHoldings> {
  const now = new Date();
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
            select: { id: true, kind: true, code: true, manualUnitPrice: true }
          })
        : [];
      const storedById = new Map(stored.map((holding) => [holding.id, holding]));
      if (new Set(ids).size !== storedById.size) throw notFound("Holding");

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
          await tx.holding.update({
            where: { id: item.id, accountId, userId },
            data: updateData(item, storedById.get(item.id)!, now)
          });
        } else {
          await tx.holding.create({
            data: {
              userId,
              accountId,
              kind: item.kind!,
              code: item.code!,
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
      throw badRequest("An account can hold each asset only once; that kind and code already exists");
    }
    throw error;
  }

  return getAccountHoldings(userId, accountId);
}
