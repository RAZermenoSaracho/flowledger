import type {
  TransactionSearchFilter,
  TransactionSummaryFilter
} from "@flowledger/shared";

/**
 * Compiles a structured MCP filter into the DSQL JSON string the transactions read service accepts.
 * Sorting (newest first) and paging are included only when the filter carries `pageSize` (search, not summary).
 * `dateTo` is made inclusive of the whole day; `text` matches the name case-insensitively.
 */
export function buildTransactionsQuery(
  filter: TransactionSearchFilter | TransactionSummaryFilter
): string {
  const conditions: unknown[] = [];

  if (filter.dateFrom) conditions.push({ field: "date", op: ">=", value: `${filter.dateFrom}T00:00:00.000Z` });
  if (filter.dateTo) {
    conditions.push({ field: "date", op: "<=", value: `${filter.dateTo}T23:59:59.999Z` });
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
