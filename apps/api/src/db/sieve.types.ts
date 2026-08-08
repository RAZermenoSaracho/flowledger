import type { DataSieveResponse } from "datasieve";

/** A datasieve engine pre-bound to one Prisma model delegate. See {@link createSieve}. */
export interface Sieve {
  /**
   * Runs `query` (typically decoded from an untrusted request) against
   * the bound delegate and returns datasieve's standard `{ data, meta }`
   * response.
   */
  query<T>(query: unknown): Promise<DataSieveResponse<T>>;
}

/**
 * A single DSQL leaf condition, as sent over the wire by
 * `apps/web/src/utils/searchDomain.ts`. Untyped against any specific
 * resource on purpose: a module's own query-input type may allow leaf
 * conditions on virtual field names that aren't real columns (see e.g.
 * transactions' `TransactionsQueryInput`), which its own service
 * rewrites into real conditions before anything reaches datasieve.
 */
export type RawWhereCondition = { field: string; op: string; value?: unknown };

/** A DSQL filter tree: {@link RawWhereCondition} leaves combined with unbounded AND/OR/NOT nesting. */
export type RawWhereNode =
  | RawWhereCondition
  | { and: RawWhereNode[] }
  | { or: RawWhereNode[] }
  | { not: RawWhereNode };
