import type { ReportFilters } from "@flowledger/shared";
import type { Prisma } from "@prisma/client";
import { REPORT_TRANSACTION_TYPES } from "../../transactions/utils/transactionCalculations.js";

/** Builds a Prisma date-range filter from `dateFrom`/`dateTo`; a bare `YYYY-MM-DD` `dateTo` is treated as exclusive of the next day rather than a literal midnight timestamp. Returns `null` when neither bound is set. */
export function dateRangeWhere(
  filters: ReportFilters
): Prisma.DateTimeFilter | null {
  if (!filters.dateFrom && !filters.dateTo) return null;
  const dateTo =
    filters.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo)
      ? new Date(new Date(filters.dateTo).getTime() + 24 * 60 * 60 * 1000)
      : filters.dateTo
        ? new Date(filters.dateTo)
        : null;

  return {
    ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
    ...(dateTo
      ? /^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo ?? "")
        ? { lt: dateTo }
        : { lte: dateTo }
      : {})
  };
}

/** Normalizes the filter's `groupIds` (multi) and `groupId` (single, legacy) into one array. */
export function selectedGroupIds(filters: ReportFilters) {
  return filters.groupIds?.length
    ? filters.groupIds
    : filters.groupId
      ? [filters.groupId]
      : [];
}

/** Normalizes the filter's `categoryIds` (multi) and `categoryId` (single, legacy) into one array. */
export function selectedCategoryIds(filters: ReportFilters) {
  return filters.categoryIds?.length
    ? filters.categoryIds
    : filters.categoryId
      ? [filters.categoryId]
      : [];
}

/** Builds the base Prisma `where` shared by income/expense report queries: ownership plus group, category, and date filters. */
export function baseReportWhere(
  userId: string,
  filters: ReportFilters
): Prisma.TransactionWhereInput {
  const date = dateRangeWhere(filters);
  const groupIds = selectedGroupIds(filters);
  const categoryIds = selectedCategoryIds(filters);

  return {
    userId,
    ...(groupIds.length ? { groupId: { in: groupIds } } : {}),
    ...(categoryIds.length ? { categoryId: { in: categoryIds } } : {}),
    ...(date ? { date } : {})
  };
}

/** Builds the Prisma `where` for expense-offset (reimbursement) income rows — those with a set `expenseOffsetCategoryId` — scoped to the report filters. */
export function offsetReportWhere(
  userId: string,
  filters: ReportFilters
): Prisma.TransactionWhereInput {
  const date = dateRangeWhere(filters);
  const groupIds = selectedGroupIds(filters);
  const categoryIds = selectedCategoryIds(filters);

  return {
    userId,
    type: "income",
    expenseOffsetCategoryId: categoryIds.length
      ? { in: categoryIds }
      : { not: null },
    ...(groupIds.length ? { groupId: { in: groupIds } } : {}),
    ...(date ? { date } : {})
  };
}

/** Builds the Prisma `where` for the monthly cashflow query; when categories are filtered, matches either a transaction's own category or its expense-offset category so reimbursements stay attributed to the right category. */
export function cashflowReportWhere(
  userId: string,
  filters: ReportFilters
): Prisma.TransactionWhereInput {
  const date = dateRangeWhere(filters);
  const groupIds = selectedGroupIds(filters);
  const categoryIds = selectedCategoryIds(filters);

  return {
    userId,
    type: { in: [...REPORT_TRANSACTION_TYPES] },
    ...(groupIds.length ? { groupId: { in: groupIds } } : {}),
    ...(categoryIds.length
      ? {
          OR: [
            { categoryId: { in: categoryIds } },
            { expenseOffsetCategoryId: { in: categoryIds } }
          ]
        }
      : {}),
    ...(date ? { date } : {})
  };
}
