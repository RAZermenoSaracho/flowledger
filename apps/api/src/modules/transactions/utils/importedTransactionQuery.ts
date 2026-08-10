import { Prisma } from "@prisma/client";
import type { DataSieveQuery, WhereInput } from "datasieve";
import { prisma } from "../../../db/prisma.js";
import { createSieve } from "../../../db/sieve.js";
import type { RawWhereNode } from "../../../db/sieve.types.js";
import { HttpError } from "../../../utils/httpError.js";
import type {
  ImportedTransactionRecord,
  ImportedTransactionSelection
} from "../types/transactions.types.js";

/** Raw-Prisma `include` for a fully-hydrated `ProviderImportedTransaction` response — used by every create/read/update service that returns one. */
export const importedTransactionInclude = {
  providerAccount: {
    include: {
      account: true,
      connection: {
        select: {
          id: true,
          institutionId: true,
          institutionName: true,
          status: true,
          lastSyncAt: true
        }
      }
    }
  },
  category: true,
  transaction: true
} satisfies Prisma.ProviderImportedTransactionInclude;

/** datasieve engine for resolving which imported-transaction ids match a `where` tree — see `resolveImportedTransactionIds`. */
const importedTransactionsSieve = createSieve(prisma.providerImportedTransaction);

/**
 * Raw-Prisma OR-clause for the free-text "search" virtual field: substring
 * match across description/provider/several relation-crossed identifiers,
 * plus two special-cased fallbacks (an exact-amount match when the term
 * parses as a number, a same-day `transactionDate` match when it parses as
 * a date) that don't correspond to any single DSQL-expressible column.
 * Extracted so `resolveImportedTransactionIds` can precompute matching ids
 * for the virtual "search" field the same way the list used to filter
 * directly, before DSQL/datasieve existed in this module.
 */
export function importedTransactionSearchWhere(
  search: string
): Prisma.ProviderImportedTransactionWhereInput {
  const searchFilters: Prisma.ProviderImportedTransactionWhereInput[] = [
    { description: { contains: search, mode: "insensitive" } },
    { provider: { contains: search, mode: "insensitive" } },
    { providerCredentialId: { contains: search, mode: "insensitive" } },
    { providerAccountId: { contains: search, mode: "insensitive" } },
    { providerTransactionId: { contains: search, mode: "insensitive" } },
    { category: { name: { contains: search, mode: "insensitive" } } },
    {
      providerAccount: {
        providerAccountId: { contains: search, mode: "insensitive" }
      }
    },
    {
      providerAccount: {
        account: { name: { contains: search, mode: "insensitive" } }
      }
    },
    {
      providerAccount: {
        connection: {
          institutionName: { contains: search, mode: "insensitive" }
        }
      }
    },
    {
      providerAccount: {
        connection: {
          institutionId: { contains: search, mode: "insensitive" }
        }
      }
    },
    {
      providerAccount: {
        accountMetadata: {
          path: ["name"],
          string_contains: search,
          mode: "insensitive"
        }
      }
    },
    {
      providerAccount: {
        accountMetadata: {
          path: ["type"],
          string_contains: search,
          mode: "insensitive"
        }
      }
    },
    {
      providerAccount: {
        accountMetadata: {
          path: ["currency"],
          string_contains: search,
          mode: "insensitive"
        }
      }
    }
  ];

  try {
    const amount = new Prisma.Decimal(search);
    if (!amount.isNaN()) searchFilters.push({ amount });
  } catch {
    // Non-numeric search terms should still match text and date fields.
  }

  const dateSearch = /^\d{4}-\d{2}-\d{2}/.test(search) ? new Date(search) : null;
  if (dateSearch && !Number.isNaN(dateSearch.getTime())) {
    const nextDay = new Date(dateSearch);
    nextDay.setDate(nextDay.getDate() + 1);
    searchFilters.push({ transactionDate: { gte: dateSearch, lt: nextDay } });
  }

  return { OR: searchFilters };
}

type ImportedSearchIdsCache = Map<string, Promise<string[]>>;

function getCachedImportedSearchIds(
  userId: string,
  search: string,
  cache: ImportedSearchIdsCache
) {
  const cached = cache.get(search);
  if (cached) return cached;

  const promise = prisma.providerImportedTransaction
    .findMany({
      where: { userId, ...importedTransactionSearchWhere(search) },
      select: { id: true }
    })
    .then((rows) => rows.map((row) => row.id));
  cache.set(search, promise);
  return promise;
}

/**
 * Walks a raw `where` tree and rewrites every leaf condition on the virtual
 * "search" field into a real `id in [...]` condition (ids resolved via
 * {@link importedTransactionSearchWhere}) — same rewrite-in-place pattern as
 * `transactions/services/read.service.ts`'s `expandVirtualConditions`, kept
 * here (utils, not read.service.ts) since batch-selection resolution
 * (create/update services) needs the same expansion, not just the list.
 */
async function expandImportedVirtualConditions(
  node: RawWhereNode | undefined,
  userId: string,
  cache: ImportedSearchIdsCache
): Promise<WhereInput<ImportedTransactionRecord> | undefined> {
  if (!node) return undefined;

  if ("and" in node) {
    const children = await Promise.all(
      node.and.map((child) => expandImportedVirtualConditions(child, userId, cache))
    );
    return { and: children.filter((child) => child !== undefined) };
  }

  if ("or" in node) {
    const children = await Promise.all(
      node.or.map((child) => expandImportedVirtualConditions(child, userId, cache))
    );
    return { or: children.filter((child) => child !== undefined) };
  }

  if ("not" in node) {
    const inner = await expandImportedVirtualConditions(node.not, userId, cache);
    return inner ? { not: inner } : undefined;
  }

  if (node.field === "search") {
    const search = String(node.value ?? "").trim();
    if (!search) return undefined;

    const ids = await getCachedImportedSearchIds(userId, search, cache);
    return { field: "id", op: "in", value: ids };
  }

  return node as WhereInput<ImportedTransactionRecord>;
}

/**
 * Resolves the ids of every imported transaction owned by `userId` matching
 * `rawWhere` (which may contain the virtual "search" condition — see
 * {@link expandImportedVirtualConditions}), in `sort` order. Used both by
 * the list endpoint and by batch action "select all filtered" resolution,
 * so a batch action always operates on exactly what the list currently
 * shows for the same filter.
 */
export async function resolveImportedTransactionIds(
  userId: string,
  rawWhere: RawWhereNode | undefined,
  sort?: DataSieveQuery<ImportedTransactionRecord>["sort"]
): Promise<string[]> {
  const cache: ImportedSearchIdsCache = new Map();
  const expandedWhere = await expandImportedVirtualConditions(rawWhere, userId, cache);
  const userCondition: WhereInput<ImportedTransactionRecord> = {
    field: "userId",
    op: "=",
    value: userId
  };
  const where = expandedWhere ? { and: [userCondition, expandedWhere] } : userCondition;

  const result = await importedTransactionsSieve.query<ImportedTransactionRecord>({
    where,
    sort
  });
  return (result.data as { id: string }[]).map((row) => row.id);
}

/**
 * Resolves a batch action's target ids: the explicit list, or everything
 * currently matching its filter. The "ids" branch re-verifies ownership
 * against the DB rather than trusting the client-supplied array directly —
 * an id list is client input, not pre-authorized, so every id not actually
 * owned by `userId` is silently dropped here (same as `{userId, id: {in:
 * ids}}` would do in a direct Prisma `where`).
 */
export async function resolveImportedTransactionSelectionIds(
  userId: string,
  selection: ImportedTransactionSelection
): Promise<string[]> {
  if (selection.mode === "ids") {
    const rows = await prisma.providerImportedTransaction.findMany({
      where: { userId, id: { in: Array.from(new Set(selection.ids)) } },
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }

  return resolveImportedTransactionIds(userId, selection.where);
}

/** Derives a `Transaction.type` from an imported transaction's signed amount; throws if the amount is exactly zero (not a valid transaction to import). */
export function importedTransactionType(amount: Prisma.Decimal) {
  if (amount.lessThan(0)) return "expense" as const;
  if (amount.greaterThan(0)) return "income" as const;
  throw new HttpError(
    400,
    "Imported transactions with a zero amount cannot be imported"
  );
}

/** Builds one row of a batch-action error list, pairing a failing imported transaction's id with why it was rejected. */
export function importValidationError(id: string, message: string) {
  return { id, message };
}
