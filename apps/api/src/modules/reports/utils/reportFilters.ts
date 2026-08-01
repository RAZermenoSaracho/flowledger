import type { ReportFilters } from "@flowledger/shared";
import type { Prisma } from "@prisma/client";
import { REPORT_TRANSACTION_TYPES } from "../../transactions/utils/transactionCalculations.js";

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

export function selectedGroupIds(filters: ReportFilters) {
  return filters.groupIds?.length
    ? filters.groupIds
    : filters.groupId
      ? [filters.groupId]
      : [];
}

export function selectedCategoryIds(filters: ReportFilters) {
  return filters.categoryIds?.length
    ? filters.categoryIds
    : filters.categoryId
      ? [filters.categoryId]
      : [];
}

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
