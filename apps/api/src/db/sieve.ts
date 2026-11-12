import { listPaginationSchema, listSortSchema } from "@flowledger/shared";
import { createDataSieve, prismaAdapter } from "datasieve";
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
 * has its page size / cursor `take` clamped to `maxPageSize`, and gets an
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
  if (raw.sort !== undefined && !listSortSchema.safeParse(raw.sort).success) throw badRequest("Invalid sort");
  if (raw.pagination === undefined) return query;

  const parsed = listPaginationSchema.safeParse(raw.pagination);
  if (!parsed.success) throw badRequest("Invalid pagination", { issues: parsed.error.flatten() });

  const max = maxPageSize ?? Infinity;
  const pagination =
    parsed.data.kind === "offset"
      ? { ...parsed.data, pageSize: Math.min(parsed.data.pageSize, max) }
      : { ...parsed.data, take: Math.min(parsed.data.take, max) };

  const sort = (raw.sort ?? []) as { field: string; direction?: string }[];
  if (sort.some((key) => key.field === "id")) return { ...raw, pagination, sort };
  const direction = sort.at(-1)?.direction ?? "desc";
  return { ...raw, pagination, sort: [...sort, { field: "id", direction }] };
}
