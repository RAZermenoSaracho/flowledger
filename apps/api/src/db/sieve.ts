import { createDataSieve, prismaAdapter } from "datasieve";
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
    async query<T>(query: unknown) {
      assertSafeQueryFields(query);
      return engine.query<T>({ resource: delegate, query });
    }
  };
}
