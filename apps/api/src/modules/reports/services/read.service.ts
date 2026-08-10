import type { ReportFilters } from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { calculateMonthlyCashflow } from "../../transactions/utils/transactionCalculations.js";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { roundMoney } from "../../currencies/utils/roundMoney.js";
import type { CurrencyGroupedSum } from "../types/reports.types.js";
import {
  baseReportWhere,
  cashflowReportWhere,
  offsetReportWhere,
  selectedCategoryIds,
  selectedGroupIds
} from "../utils/reportFilters.js";
import { convertAmount } from "../utils/reportCurrency.js";
import { prepareCategoryChartRows } from "../utils/categoryChartRows.js";

/** Resolves the currency a report renders in: the user's explicit filter choice, or their profile's preferred currency. */
async function resolveReportCurrency(userId: string, filters: ReportFilters) {
  if (filters.currency) return filters.currency;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { preferredCurrency: true }
  });
  return (user.preferredCurrency || "USD").toUpperCase();
}

/** Collapses per-currency `groupBy` buckets into a single map keyed by `keyOf`, converting each bucket to `targetCurrency` before summing. */
async function collapseCurrencySums<TRow extends CurrencyGroupedSum, TKey>(
  rows: TRow[],
  keyOf: (row: TRow) => TKey,
  targetCurrency: string
): Promise<Map<TKey, number>> {
  const totals = new Map<TKey, number>();

  for (const row of rows) {
    const amount = row._sum.amount?.toNumber() ?? 0;
    if (amount === 0) continue;

    const rate =
      row.executionCurrency === targetCurrency
        ? 1
        : await getExchangeRate(row.executionCurrency, targetCurrency);
    const key = keyOf(row);
    totals.set(key, (totals.get(key) ?? 0) + amount * rate);
  }

  for (const [key, value] of totals) {
    totals.set(key, roundMoney(value));
  }

  return totals;
}

/** Sums a single currency-grouped bucket set into one converted total. */
async function sumCurrencyRows(
  rows: CurrencyGroupedSum[],
  targetCurrency: string
): Promise<number> {
  const totals = await collapseCurrencySums(rows, () => "total", targetCurrency);
  return totals.get("total") ?? 0;
}

/** Computes the top-of-page income/expense/balance summary for the reports dashboard. */
export async function getSummaryReport(userId: string, filters: ReportFilters) {
  const targetCurrency = await resolveReportCurrency(userId, filters);
  const baseWhere = baseReportWhere(userId, filters);
  const offsetWhere = offsetReportWhere(userId, filters);
  const [incomeRows, netIncomeRows, expenseRows, expenseReimbursementRows] =
    await Promise.all([
      prisma.transaction.groupBy({
        by: ["executionCurrency"],
        where: {
          ...baseWhere,
          type: "income"
        },
        _sum: { amount: true }
      }),
      prisma.transaction.groupBy({
        by: ["executionCurrency"],
        where: {
          ...baseWhere,
          type: "income",
          expenseOffsetCategoryId: null
        },
        _sum: { amount: true }
      }),
      prisma.transaction.groupBy({
        by: ["executionCurrency"],
        where: { ...baseWhere, type: "expense" },
        _sum: { amount: true }
      }),
      prisma.transaction.groupBy({
        by: ["executionCurrency"],
        where: offsetWhere,
        _sum: { amount: true }
      })
    ]);

  const [
    totalGrossIncome,
    totalNetIncome,
    totalGrossExpenses,
    totalExpenseReimbursements
  ] = await Promise.all([
    sumCurrencyRows(incomeRows, targetCurrency),
    sumCurrencyRows(netIncomeRows, targetCurrency),
    sumCurrencyRows(expenseRows, targetCurrency),
    sumCurrencyRows(expenseReimbursementRows, targetCurrency)
  ]);
  const totalNetExpenses = totalGrossExpenses - totalExpenseReimbursements;
  const amountMode = filters.amountMode ?? "net";
  const reportIncome = amountMode === "gross" ? totalGrossIncome : totalNetIncome;
  const reportExpenses =
    amountMode === "gross" ? totalGrossExpenses : totalNetExpenses;

  return {
    summary: {
      totalIncome: totalNetIncome,
      totalGrossIncome,
      totalNetIncome,
      totalExpenses: totalNetExpenses,
      totalGrossExpenses,
      totalExpenseReimbursements,
      totalNetExpenses,
      currentBalance: totalGrossIncome - totalGrossExpenses,
      reportIncome,
      reportExpenses,
      reportBalance: reportIncome - reportExpenses
    },
    currency: targetCurrency
  };
}

/** Computes per-category income/expense breakdown rows (chart-ready) for the reports dashboard. */
export async function getByCategoryReport(
  userId: string,
  filters: ReportFilters
) {
  const targetCurrency = await resolveReportCurrency(userId, filters);
  const baseWhere = baseReportWhere(userId, filters);
  const offsetWhere = offsetReportWhere(userId, filters);
  const groupIds = selectedGroupIds(filters);
  const categoryIds = selectedCategoryIds(filters);
  const [rows, expenseReimbursementRows, incomeOffsetRows] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["categoryId", "type", "executionCurrency"],
      where: {
        ...baseWhere,
        type: { in: ["income", "expense"] }
      },
      _sum: { amount: true }
    }),
    prisma.transaction.groupBy({
      by: ["expenseOffsetCategoryId", "executionCurrency"],
      where: offsetWhere,
      _sum: { amount: true }
    }),
    prisma.transaction.groupBy({
      by: ["categoryId", "executionCurrency"],
      where: {
        ...baseWhere,
        type: "income",
        expenseOffsetCategoryId: { not: null }
      },
      _sum: { amount: true }
    })
  ]);

  const categories = await prisma.category.findMany({
    where: {
      users: { some: { userId } },
      ...(groupIds.length ? { groupId: { in: groupIds } } : {}),
      ...(categoryIds.length ? { id: { in: categoryIds } } : {})
    }
  });
  const categoryById = new Map(
    categories.map((category) => [category.id, category])
  );

  const rowTotals = await collapseCurrencySums(
    rows,
    (row) => `${row.type}:${row.categoryId ?? "uncategorized"}`,
    targetCurrency
  );
  const reimbursementsByCategoryId = await collapseCurrencySums(
    expenseReimbursementRows,
    (row) => row.expenseOffsetCategoryId,
    targetCurrency
  );
  const incomeOffsetsByCategoryId = await collapseCurrencySums(
    incomeOffsetRows,
    (row) => row.categoryId,
    targetCurrency
  );

  const rowCombos = new Map<
    string,
    { categoryId: string | null; type: "income" | "expense" }
  >();
  for (const row of rows) {
    const key = `${row.type}:${row.categoryId ?? "uncategorized"}`;
    if (!rowCombos.has(key)) {
      rowCombos.set(key, {
        categoryId: row.categoryId,
        type: row.type as "income" | "expense"
      });
    }
  }
  const rowKeys = new Set(rowCombos.keys());
  const seenReimbursementCategoryIds = new Set<string>();
  const reimbursementOnlyCombos: {
    categoryId: string;
    type: "expense";
  }[] = [];
  for (const row of expenseReimbursementRows) {
    const categoryId = row.expenseOffsetCategoryId;
    if (
      categoryId &&
      !rowKeys.has(`expense:${categoryId}`) &&
      !seenReimbursementCategoryIds.has(categoryId)
    ) {
      seenReimbursementCategoryIds.add(categoryId);
      reimbursementOnlyCombos.push({ categoryId, type: "expense" });
    }
  }

  const categoryRows = [...rowCombos.values(), ...reimbursementOnlyCombos].map(
    ({ categoryId, type }) => {
      const category = categoryId ? categoryById.get(categoryId) : null;
      const key = `${type}:${categoryId ?? "uncategorized"}`;
      const total = rowTotals.get(key) ?? 0;
      const reimbursementTotal =
        type === "expense" && categoryId
          ? (reimbursementsByCategoryId.get(categoryId) ?? 0)
          : 0;
      const incomeOffsetTotal =
        type === "income" ? (incomeOffsetsByCategoryId.get(categoryId) ?? 0) : 0;
      const grossIncomeTotal = type === "income" ? total : 0;
      const netIncomeTotal = type === "income" ? total - incomeOffsetTotal : 0;

      return {
        categoryId,
        categoryName: category?.name ?? "Uncategorized",
        categoryType: category?.type ?? null,
        categoryColor: category?.color ?? null,
        type,
        total: type === "expense" ? total - reimbursementTotal : netIncomeTotal,
        grossIncomeTotal,
        incomeOffsetTotal,
        netIncomeTotal,
        grossExpenseTotal: type === "expense" ? total : 0,
        reimbursementTotal,
        netExpenseTotal: type === "expense" ? total - reimbursementTotal : 0
      };
    }
  );
  const amountMode = filters.amountMode ?? "net";

  return {
    expenseCategories: prepareCategoryChartRows(
      categoryRows,
      "expense",
      amountMode
    ),
    incomeCategories: prepareCategoryChartRows(
      categoryRows,
      "income",
      amountMode
    ),
    currency: targetCurrency
  };
}

/** Computes month-by-month income/expense/balance rows for the cashflow report. */
export async function getMonthlyCashflowReport(
  userId: string,
  filters: ReportFilters
) {
  const targetCurrency = await resolveReportCurrency(userId, filters);
  const transactions = await prisma.transaction.findMany({
    where: cashflowReportWhere(userId, filters),
    select: {
      date: true,
      type: true,
      amount: true,
      executionCurrency: true,
      categoryId: true,
      expenseOffsetCategoryId: true
    },
    orderBy: { date: "asc" }
  });
  const convertedTransactions = await Promise.all(
    transactions.map(async (transaction) => ({
      ...transaction,
      amount: await convertAmount(
        transaction.amount,
        transaction.executionCurrency,
        targetCurrency
      )
    }))
  );

  const amountMode = filters.amountMode ?? "net";
  const cashflow = calculateMonthlyCashflow(convertedTransactions, {
    categoryIds: selectedCategoryIds(filters)
  }).map((row) => ({
    ...row,
    reportIncome: amountMode === "gross" ? row.grossIncome : row.netIncome,
    reportExpenses: amountMode === "gross" ? row.grossExpenses : row.netExpenses
  }));

  return {
    cashflow,
    currency: targetCurrency
  };
}
