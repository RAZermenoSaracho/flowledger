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

/**
 * Most rows one batch import may resolve to (the web `filtered` mode and unbounded web `ids` lists; `/v1` and MCP already cap at 50). The batch commits in a single database transaction, so it cannot be chunked; a larger selection is rejected instead.
 */
export const MAX_BATCH_IMPORT_ROWS = 500;

/** Timeout (ms) of the single database transaction that imports a batch; sized for {@link MAX_BATCH_IMPORT_ROWS} rows at a create plus an update each. */
export const BATCH_IMPORT_TRANSACTION_TIMEOUT_MS = 30_000;
