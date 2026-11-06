import type {
  TransactionSearchFilter,
  TransactionSummaryFilter
} from "@flowledger/shared";
import { exclusiveDateRangeEnd } from "../../../utils/dateRange.js";

/**
 * Compiles a structured MCP filter into the DSQL JSON string the transactions read service accepts.
 * Sorting (newest first) and paging are included only when the filter carries `pageSize` (search, not summary).
 * Dates compile to a half-open UTC range (see {@link exclusiveDateRangeEnd}); `text` matches the name case-insensitively.
 */
export function buildTransactionsQuery(
  filter: TransactionSearchFilter | TransactionSummaryFilter
): string {
  const conditions: unknown[] = [];

  if (filter.dateFrom) {
    conditions.push({ field: "date", op: ">=", value: new Date(filter.dateFrom).toISOString() });
  }
  if (filter.dateTo) {
    conditions.push({ field: "date", op: "<", value: exclusiveDateRangeEnd(filter.dateTo).toISOString() });
  }
  if (filter.accountId) conditions.push({ field: "accountId", op: "=", value: filter.accountId });
  if (filter.categoryId) conditions.push({ field: "categoryId", op: "=", value: filter.categoryId });
  if (filter.type) conditions.push({ field: "type", op: "=", value: filter.type });
  if (filter.text) conditions.push({ field: "name", op: "ilike", value: filter.text });

  const query: Record<string, unknown> = {};
  if (conditions.length) query.where = { and: conditions };
  if ("pageSize" in filter) {
    query.sort = [{ field: "date", direction: "desc" }];
    query.pagination = { kind: "offset", page: filter.page, pageSize: filter.pageSize };
  }
  return JSON.stringify(query);
}
