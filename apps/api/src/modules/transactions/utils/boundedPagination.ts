import type { DataSieveQuery } from "datasieve";
import type { TransactionRecord } from "../types/transactions.types.js";

/**
 * Largest page a transaction list returns. The web Transactions page still loads its whole result in one request.
 * ponytail: a user past this many matching transactions sees only this many on that page; add page controls there if it's ever reached.
 */
export const MAX_TRANSACTION_PAGE_SIZE = 10_000;

/** Applies the maximum page size, and makes it the default when a query asks for no pagination. */
export function boundedPagination(
  pagination: DataSieveQuery<TransactionRecord>["pagination"]
): DataSieveQuery<TransactionRecord>["pagination"] {
  if (!pagination) {
    return { kind: "offset", page: 1, pageSize: MAX_TRANSACTION_PAGE_SIZE };
  }

  if (pagination.kind === "offset") {
    return { ...pagination, pageSize: Math.min(pagination.pageSize, MAX_TRANSACTION_PAGE_SIZE) };
  }

  return pagination;
}
