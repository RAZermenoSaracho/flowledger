import type { CreditCardCredits, ReportFilters } from "@flowledger/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { calculateMonthlyCashflow } from "../../transactions/utils/transactionCalculations.js";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { valueInCurrency } from "../../currencies/utils/valuation.js";
import type { CurrencyGroupedSum } from "../types/reports.types.js";
import {
  baseReportWhere,
  cashflowReportWhere,
  nonCardIncomeWhere,
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

/** Collapses per-currency `groupBy` buckets into a single map keyed by `keyOf`, valuing each bucket in `targetCurrency` (half-up to its minor units) before summing exactly. */
async function collapseCurrencySums<TRow extends CurrencyGroupedSum, TKey>(
  rows: TRow[],
  keyOf: (row: TRow) => TKey,
  targetCurrency: string
): Promise<Map<TKey, Prisma.Decimal>> {
  const totals = new Map<TKey, Prisma.Decimal>();

  for (const row of rows) {
    const amount = row._sum.amount ?? new Prisma.Decimal(0);
    if (amount.isZero()) continue;

    const rate =
      row.executionCurrency === targetCurrency
        ? 1
        : await getExchangeRate(row.executionCurrency, targetCurrency);
    const key = keyOf(row);
    totals.set(
      key,
      (totals.get(key) ?? new Prisma.Decimal(0)).plus(
        valueInCurrency(amount, rate, targetCurrency)
      )
    );
  }

  return totals;
}

/** Sums a single currency-grouped bucket set into one exact converted total. */
async function sumCurrencyRows(
  rows: CurrencyGroupedSum[],
  targetCurrency: string
): Promise<Prisma.Decimal> {
  const totals = await collapseCurrencySums(rows, () => "total", targetCurrency);
  return totals.get("total") ?? new Prisma.Decimal(0);
}

/** Sums credits that reduced credit-card debt: transfers into a card plus all income booked on a card, split by `creditCardKind`. Independent of the amount mode. */
async function getCreditCardCredits(
  baseWhere: Prisma.TransactionWhereInput,
  targetCurrency: string
): Promise<CreditCardCredits> {
  const [transferRows, incomeRows] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["executionCurrency"],
      where: {
        ...baseWhere,
        type: "transfer",
        transferToAccount: { type: "credit_card" }
      },
      _sum: { amount: true }
    }),
    prisma.transaction.groupBy({
      by: ["creditCardKind", "executionCurrency"],
      where: { ...baseWhere, type: "income", account: { type: "credit_card" } },
      _sum: { amount: true }
    })
  ]);
  const transfers = await sumCurrencyRows(transferRows, targetCurrency);
  const byKind = await collapseCurrencySums(
    incomeRows,
    (row) =>
      row.creditCardKind === "payment" ||
      row.creditCardKind === "refund" ||
      row.creditCardKind === "cashback"
        ? row.creditCardKind
        : "other",
    targetCurrency
  );
  const zero = new Prisma.Decimal(0);
  const payments = byKind.get("payment") ?? zero;
  const refunds = byKind.get("refund") ?? zero;
  const cashback = byKind.get("cashback") ?? zero;
  const other = byKind.get("other") ?? zero;

  return {
    total: transfers.plus(payments).plus(refunds).plus(cashback).plus(other).toString(),
    transfers: transfers.toString(),
    payments: payments.toString(),
    refunds: refunds.toString(),
    cashback: cashback.toString(),
    other: other.toString()
  };
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
          type: "income",
          AND: [nonCardIncomeWhere]
        },
        _sum: { amount: true }
      }),
      prisma.transaction.groupBy({
        by: ["executionCurrency"],
        where: {
          ...baseWhere,
          type: "income",
          expenseOffsetCategoryId: null,
          AND: [nonCardIncomeWhere]
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
  const totalNetExpenses = totalGrossExpenses.minus(totalExpenseReimbursements);
  const creditCardCredits = await getCreditCardCredits(baseWhere, targetCurrency);
  const amountMode = filters.amountMode ?? "net";
  const reportIncome = amountMode === "gross" ? totalGrossIncome : totalNetIncome;
  const reportExpenses =
    amountMode === "gross" ? totalGrossExpenses : totalNetExpenses;

  return {
    summary: {
      totalIncome: totalNetIncome.toNumber(),
      totalGrossIncome: totalGrossIncome.toNumber(),
      totalNetIncome: totalNetIncome.toNumber(),
      totalExpenses: totalNetExpenses.toNumber(),
      totalGrossExpenses: totalGrossExpenses.toNumber(),
      totalExpenseReimbursements: totalExpenseReimbursements.toNumber(),
      totalNetExpenses: totalNetExpenses.toNumber(),
      currentBalance: totalGrossIncome.minus(totalGrossExpenses).toNumber(),
      reportIncome: reportIncome.toNumber(),
      reportExpenses: reportExpenses.toNumber(),
      reportBalance: reportIncome.minus(reportExpenses).toNumber(),
      creditCardCredits
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
        OR: [
          { type: "expense" },
          { type: "income", AND: [nonCardIncomeWhere] }
        ]
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
        expenseOffsetCategoryId: { not: null },
        AND: [nonCardIncomeWhere]
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
      const zero = new Prisma.Decimal(0);
      const total = rowTotals.get(key) ?? zero;
      const reimbursementTotal =
        type === "expense" && categoryId
          ? (reimbursementsByCategoryId.get(categoryId) ?? zero)
          : zero;
      const incomeOffsetTotal =
        type === "income" ? (incomeOffsetsByCategoryId.get(categoryId) ?? zero) : zero;
      const netIncomeTotal = type === "income" ? total.minus(incomeOffsetTotal) : zero;
      const netExpenseTotal = type === "expense" ? total.minus(reimbursementTotal) : zero;

      return {
        categoryId,
        categoryName: category?.name ?? "Uncategorized",
        categoryType: category?.type ?? null,
        categoryColor: category?.color ?? null,
        type,
        total: (type === "expense" ? netExpenseTotal : netIncomeTotal).toNumber(),
        grossIncomeTotal: (type === "income" ? total : zero).toNumber(),
        incomeOffsetTotal: incomeOffsetTotal.toNumber(),
        netIncomeTotal: netIncomeTotal.toNumber(),
        grossExpenseTotal: (type === "expense" ? total : zero).toNumber(),
        reimbursementTotal: reimbursementTotal.toNumber(),
        netExpenseTotal: netExpenseTotal.toNumber()
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

// ponytail: bounds memory for one report; a user past this many matching rows sees only the oldest, aggregate in SQL if it's ever reached.
const MAX_CASHFLOW_TRANSACTIONS = 100_000;

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
      expenseOffsetCategoryId: true,
      account: { select: { type: true } }
    },
    orderBy: { date: "asc" },
    take: MAX_CASHFLOW_TRANSACTIONS
  });
  const convertedTransactions = await Promise.all(
    transactions.map(async ({ account, ...transaction }) => ({
      ...transaction,
      accountType: account?.type ?? null,
      amount: await convertAmount(
        transaction.amount,
        transaction.executionCurrency,
        targetCurrency
      )
    }))
  );

  const amountMode = filters.amountMode ?? "net";
  const cashflow = calculateMonthlyCashflow(
    convertedTransactions,
    { categoryIds: selectedCategoryIds(filters) },
    filters.timeZone
  ).map((row) => ({
    ...row,
    reportIncome: amountMode === "gross" ? row.grossIncome : row.netIncome,
    reportExpenses: amountMode === "gross" ? row.grossExpenses : row.netExpenses
  }));

  return {
    cashflow,
    currency: targetCurrency
  };
}
