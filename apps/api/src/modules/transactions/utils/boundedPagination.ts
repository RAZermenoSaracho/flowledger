import type { DataSieveQuery } from "datasieve";
import type { TransactionRecord } from "../types/transactions.types.js";

/**
 * Largest page a transaction list returns. The web Transactions page still loads its whole result in one request.
 * ponytail: a user past this many matching transactions sees only this many on that page; add page controls there if it's ever reached.
 */
export const MAX_TRANSACTION_PAGE_SIZE = 10_000;

/** Defaults a query that asks for no pagination to one page of the maximum size; a requested page size is clamped by the transactions sieve. */
export function boundedPagination(
  pagination: DataSieveQuery<TransactionRecord>["pagination"]
): DataSieveQuery<TransactionRecord>["pagination"] {
  if (!pagination) {
    return { kind: "offset", page: 1, pageSize: MAX_TRANSACTION_PAGE_SIZE };
  }

  return pagination;
}
