import type {
  FinancialOverview,
  FinancialOverviewDisclosure
} from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { roundMoney } from "../../currencies/utils/roundMoney.js";
import { balanceDebt } from "../../debts/utils/debtCalculations.js";
import { isDebtRelevantToUser } from "../../debts/utils/debtDirection.js";
import { debtInclude } from "../../debts/utils/debtInclude.js";
import { isCountedShare } from "../../debts/utils/shareAcceptance.js";
import { userLabel } from "../../users/utils/publicUser.js";
import {
  calculateAccountBalance,
  calculateMonthlyCashflow
} from "../../transactions/utils/transactionCalculations.js";

type NetWorth = FinancialOverview["netWorth"];
type SavingsRate = FinancialOverview["savingsRate"];
type MetricResult<T> = { value: T; disclosures: FinancialOverviewDisclosure[] };

async function convert(amount: number, from: string, to: string) {
  if (from === to || amount === 0) return amount;
  return roundMoney(amount * (await getExchangeRate(from, to)));
}

function monthOf(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

function previousMonth(now: Date, timeZone: string) {
  const [year, month] = monthOf(now, timeZone).split("-").map(Number) as [number, number];
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}

async function computeNetWorth(userId: string, currency: string): Promise<MetricResult<NetWorth>> {
  const [accounts, transactions, participants] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
        initialBalance: true,
        isArchived: true,
        providerAccounts: { select: { id: true }, take: 1 }
      }
    }),
    prisma.transaction.findMany({
      where: { userId },
      select: {
        accountId: true,
        transferToAccountId: true,
        type: true,
        amount: true,
        executionCurrency: true
      }
    }),
    prisma.sharedExpenseParticipant.findMany({
      where: { OR: [{ userId }, { sharedExpense: { ownerUserId: userId } }] },
      include: debtInclude
    })
  ]);

  const disclosures = new Set<FinancialOverviewDisclosure>();
  const excluded: string[] = [];
  const balances = accounts.map((account) => ({
    account,
    balance: calculateAccountBalance(account.id, transactions, account.initialBalance)
  }));
  const active = balances.filter(({ account }) => !account.isArchived);

  if (balances.some(({ account, balance }) => account.isArchived && balance !== 0)) {
    disclosures.add("archived_balance_excluded");
  }
  if (active.some(({ account }) => account.type === "investment")) {
    disclosures.add("investment_recorded_balance");
  }
  if (active.some(({ account }) => account.providerAccounts.length > 0)) {
    disclosures.add("synced_balances");
  }
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  if (
    transactions.some((t) =>
      t.accountId && currencyOf.has(t.accountId)
        ? t.executionCurrency !== currencyOf.get(t.accountId) ||
          (t.transferToAccountId !== null &&
            currencyOf.get(t.transferToAccountId) !== currencyOf.get(t.accountId))
        : false
    )
  ) {
    disclosures.add("cross_currency_effects");
  }

  const accountResults = await Promise.allSettled(
    active.map(({ account, balance }) => convert(balance, account.currency, currency))
  );
  let accountsTotal = 0;
  accountResults.forEach((result, index) => {
    if (result.status === "fulfilled") accountsTotal += result.value;
    else excluded.push(active[index]!.account.name);
  });

  const debts = participants
    .filter((debt) => isDebtRelevantToUser(debt, userId))
    .map((debt) => balanceDebt(debt));
  const awaitingAcceptance = debts.filter((d) => d.acceptance === "proposed").length;
  const counted = debts.filter((d) => isCountedShare(d) && d.outstandingAmount > 0);
  const debtResults = await Promise.allSettled(
    counted.map((debt) => convert(debt.outstandingAmount, debt.currency, currency))
  );
  let owedToMe = 0;
  let iOwe = 0;
  debtResults.forEach((result, index) => {
    const debt = counted[index]!;
    if (result.status === "rejected") {
      excluded.push(`${debt.user ? userLabel(debt.user) : debt.participantName}: ${debt.sharedExpense.transaction.name}`);
    } else if (debt.creditorUserId === userId) owedToMe += result.value;
    else iOwe += result.value;
  });
  if (excluded.length) disclosures.add("rates_missing");

  accountsTotal = roundMoney(accountsTotal);
  owedToMe = roundMoney(owedToMe);
  iOwe = roundMoney(iOwe);
  return {
    value: {
      status: "ok",
      total: roundMoney(accountsTotal + owedToMe - iOwe),
      accounts: accountsTotal,
      owedToMe,
      iOwe,
      partial: excluded.length > 0,
      excluded,
      awaitingAcceptance
    },
    disclosures: [...disclosures]
  };
}

async function computeSavingsRate(
  userId: string,
  currency: string,
  timeZone: string,
  now: Date
): Promise<MetricResult<SavingsRate>> {
  const month = previousMonth(now, timeZone);
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  // Two-day padding on each side covers every UTC offset; rows are then bucketed exactly by month in the user's zone.
  const from = new Date(Date.UTC(year, monthNumber - 1, 1) - 2 * 86_400_000);
  const to = new Date(Date.UTC(year, monthNumber, 1) + 2 * 86_400_000);
  const rows = (
    await prisma.transaction.findMany({
      where: { userId, type: { in: ["income", "expense"] }, date: { gte: from, lt: to } },
      select: {
        date: true,
        type: true,
        amount: true,
        executionCurrency: true,
        categoryId: true,
        expenseOffsetCategoryId: true
      }
    })
  ).filter((row) => monthOf(row.date, timeZone) === month);

  if (rows.length === 0) return { value: { status: "no_data", month }, disclosures: [] };

  const disclosures: FinancialOverviewDisclosure[] = rows.some(
    (row) => row.executionCurrency !== currency
  )
    ? ["past_month_current_rates"]
    : [];
  const converted = await Promise.allSettled(
    rows.map((row) => convert(row.amount.toNumber(), row.executionCurrency, currency))
  );
  if (converted.some((result) => result.status === "rejected")) {
    return { value: { status: "unavailable_rate", month }, disclosures };
  }

  const cashflow = calculateMonthlyCashflow(
    rows.map((row, index) => ({
      ...row,
      amount: (converted[index] as PromiseFulfilledResult<number>).value
    })),
    {},
    timeZone
  ).find((row) => row.month === month);
  const netIncome = roundMoney(cashflow?.netIncome ?? 0);
  const netExpenses = roundMoney(cashflow?.netExpenses ?? 0);
  if (netIncome <= 0) {
    return { value: { status: "unavailable_income", month }, disclosures };
  }
  return {
    value: {
      status: "ok",
      month,
      rate: roundMoney(((netIncome - netExpenses) / netIncome) * 100),
      netIncome,
      netExpenses
    },
    disclosures
  };
}

/**
 * Builds the Profile financial overview for one user: estimated net worth and last-complete-month savings rate,
 * both in the preferred currency (USD fallback). The metrics are computed independently, so a failure in one
 * yields `status: "error"` for it while the other is still returned. `now` is injectable for tests.
 */
export async function getFinancialOverview(
  userId: string,
  timeZone = "UTC",
  now = new Date()
): Promise<FinancialOverview> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { preferredCurrency: true }
  });
  const currency = (user.preferredCurrency || "USD").toUpperCase();
  const [netWorth, savingsRate] = await Promise.allSettled([
    computeNetWorth(userId, currency),
    computeSavingsRate(userId, currency, timeZone, now)
  ]);
  const disclosures = new Set<FinancialOverviewDisclosure>();
  for (const result of [netWorth, savingsRate]) {
    if (result.status === "fulfilled") result.value.disclosures.forEach((d) => disclosures.add(d));
  }

  return {
    currency,
    netWorth: netWorth.status === "fulfilled" ? netWorth.value.value : { status: "error" },
    savingsRate:
      savingsRate.status === "fulfilled" ? savingsRate.value.value : { status: "error" },
    disclosures: [...disclosures]
  };
}
