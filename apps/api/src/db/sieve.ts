import { listPaginationSchema, listSortSchema } from "@flowledger/shared";
import { createDataSieve, OPERATORS, prismaAdapter } from "datasieve";
import { badRequest } from "../utils/httpError.js";
import { prisma } from "./prisma.js";
import { assertSafeQueryFields } from "./sieveFieldGuard.js";
import type { Sieve } from "./sieve.types.js";

/**
 * Creates a {@link Sieve} bound to one Prisma model delegate, with
 * FlowLedger's shared datasieve configuration applied once:
 *
 * - `caseInsensitiveMode: true` — FlowLedger always runs on Postgres,
 *   where Prisma's `mode: "insensitive"` is supported (the adapter
 *   defaults this off since SQLite rejects it outright).
 * - Rejects queries reaching another user's record or a stored hash through a relation path, see {@link assertSafeQueryFields}.
 * - No `defaultPageSize` — a query that omits `pagination` runs fully
 *   unpaginated rather than being silently capped.
 *
 * A malformed `sort` is rejected with a 400. A query that carries `pagination` is validated (400 on bad page/size),
 * has its page size / range `limit` / cursor `take` clamped to `maxPageSize`, and gets an
 * `id` sort key appended (same direction as the last sort key, `desc`
 * with no sort) so rows sharing a sort value never move between pages.
 *
 * @param delegate - A Prisma model delegate, e.g. `prisma.transaction`.
 * @param options.maxPageSize - Upper bound for a requested page size; unbounded when omitted.
 *
 * @example
 * ```ts
 * export const transactionsSieve = createSieve(prisma.transaction);
 * ```
 */
export function createSieve<TDelegate>(
  delegate: TDelegate,
  options: { maxPageSize?: number } = {}
): Sieve {
  const engine = createDataSieve<TDelegate>({
    adapter: prismaAdapter(prisma, { caseInsensitiveMode: true })
  });

  return {
    async query<T>(query: unknown) {
      assertSafeQueryFields(query);
      assertKnownOperators(query);
      return engine.query<T>({
        resource: delegate,
        query: boundPaginatedQuery(query, options.maxPageSize)
      });
    }
  };
}

function boundPaginatedQuery(query: unknown, maxPageSize?: number): unknown {
  const raw = query as { pagination?: unknown; sort?: unknown };
  if (!raw || typeof raw !== "object") return query;
  if (raw.sort !== undefined && !listSortSchema.safeParse(raw.sort).success)
    throw badRequest("Invalid sort");
  if (raw.pagination === undefined) return query;

  const parsed = listPaginationSchema.safeParse(raw.pagination);
  if (!parsed.success) throw badRequest("Invalid pagination", { issues: parsed.error.flatten() });

  const max = maxPageSize ?? Infinity;
  const pagination =
    parsed.data.kind === "offset"
      ? { ...parsed.data, pageSize: Math.min(parsed.data.pageSize, max) }
      : parsed.data.kind === "range"
        ? { ...parsed.data, limit: Math.min(parsed.data.limit, max) }
        : { ...parsed.data, take: Math.min(parsed.data.take, max) };

  const sort = (raw.sort ?? []) as { field: string; direction?: string }[];
  if (sort.some((key) => key.field === "id")) return { ...raw, pagination, sort };
  const direction = sort.at(-1)?.direction ?? "desc";
  return { ...raw, pagination, sort: [...sort, { field: "id", direction }] };
}

const SUPPORTED_OPERATORS: ReadonlySet<string> = new Set(
  Object.values(OPERATORS)
    .filter((definition) => !("reserved" in definition && definition.reserved))
    .map((definition) => definition.name)
);

/**
 * Rejects any filter condition whose `op` is missing or not a datasieve operator the Prisma adapter supports,
 * walking every `where` tree (including nested `and`/`or`/`not` groups and `include.where`).
 * datasieve silently drops an unknown operator, which would turn a mistyped scope filter into an unscoped query.
 * Applies to user-supplied and server-built filters alike, so a typo in either fails closed.
 * @throws 400 for an unknown, reserved or missing operator.
 */
export function assertKnownOperators(query: unknown): void {
  if (Array.isArray(query)) return query.forEach(assertKnownOperators);
  if (typeof query !== "object" || query === null) return;

  for (const [key, value] of Object.entries(query)) {
    if (key === "value") continue;
    if (key === "where") assertKnownWhere(value);
    else assertKnownOperators(value);
  }
}

function assertKnownWhere(node: unknown): void {
  if (node === undefined) return;
  if (typeof node !== "object" || node === null) throw badRequest("Invalid filter");
  const group = node as { and?: unknown; or?: unknown; not?: unknown; op?: unknown };
  let isGroup = false;
  for (const key of ["and", "or"] as const) {
    if (group[key] === undefined) continue;
    if (!Array.isArray(group[key])) throw badRequest(`Invalid filter: "${key}" must be an array`);
    group[key].forEach(assertKnownWhere);
    isGroup = true;
  }
  if (group.not !== undefined) {
    assertKnownWhere(group.not);
    isGroup = true;
  }
  // Every branch is checked independently and `op` is validated whenever present, so no shape can carry an
  // operator datasieve would silently drop.
  if (group.op !== undefined || !isGroup) {
    if (typeof group.op !== "string" || !SUPPORTED_OPERATORS.has(group.op)) {
      throw badRequest(`Unknown filter operator ${JSON.stringify(group.op)}`);
    }
  }
}
