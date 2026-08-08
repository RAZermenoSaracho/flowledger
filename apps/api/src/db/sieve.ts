import { createDataSieve, prismaAdapter } from "datasieve";
import { prisma } from "./prisma.js";
import type { Sieve } from "./sieve.types.js";

/**
 * Creates a {@link Sieve} bound to one Prisma model delegate, with
 * FlowLedger's shared datasieve configuration applied once:
 *
 * - `caseInsensitiveMode: true` — FlowLedger always runs on Postgres,
 *   where Prisma's `mode: "insensitive"` is supported (the adapter
 *   defaults this off since SQLite rejects it outright).
 * - No `defaultPageSize` — a query that omits `pagination` runs fully
 *   unpaginated rather than being silently capped.
 *
 * @param delegate - A Prisma model delegate, e.g. `prisma.transaction`.
 *
 * @example
 * ```ts
 * export const transactionsSieve = createSieve(prisma.transaction);
 * ```
 */
export function createSieve<TDelegate>(delegate: TDelegate): Sieve {
  const engine = createDataSieve<TDelegate>({
    adapter: prismaAdapter(prisma, { caseInsensitiveMode: true })
  });

  return {
    query<T>(query: unknown) {
      return engine.query<T>({ resource: delegate, query });
    }
  };
}
