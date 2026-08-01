import type { ReportFilters } from "@flowledger/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { roundMoney } from "../../currencies/utils/roundMoney.js";

export async function resolveReportCurrency(
  userId: string,
  filters: ReportFilters
) {
  if (filters.currency) return filters.currency;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { preferredCurrency: true }
  });
  return (user.preferredCurrency || "USD").toUpperCase();
}

export async function convertAmount(
  amount: Prisma.Decimal,
  from: string,
  to: string
): Promise<number> {
  const value = amount.toNumber();
  if (from === to || value === 0) return value;

  const rate = await getExchangeRate(from, to);
  return roundMoney(value * rate);
}

export type CurrencyGroupedSum = {
  _sum: { amount: Prisma.Decimal | null };
  executionCurrency: string;
};

// Collapses per-currency groupBy buckets into a single map keyed by `keyOf`,
// converting each bucket to `targetCurrency` before summing.
export async function collapseCurrencySums<
  TRow extends CurrencyGroupedSum,
  TKey
>(
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

export async function sumCurrencyRows(
  rows: CurrencyGroupedSum[],
  targetCurrency: string
): Promise<number> {
  const totals = await collapseCurrencySums(rows, () => "total", targetCurrency);
  return totals.get("total") ?? 0;
}
