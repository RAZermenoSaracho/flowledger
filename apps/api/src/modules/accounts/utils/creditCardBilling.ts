import {
  currencyFractionDigits,
  type BillingPeriod,
  type BillingPeriodStatus,
  type CreditBreakdown,
  type CreditCardBilling,
  type InterestEstimate
} from "@flowledger/shared";
import { Prisma } from "@prisma/client";
import { transactionBalanceDelta } from "../../transactions/utils/transactionCalculations.js";
import type {
  CardBillingAccount,
  CardEntry,
  CreditKind,
  CycleConfig,
  PeriodBounds,
  PeriodOverrides
} from "../types/creditCardBilling.types.js";
import {
  addDays,
  closingDateOf,
  daysBetween,
  defaultClosingDateOf,
  defaultDueDateOf,
  enumeratePeriodIndexes,
  formatLocalDate,
  parseLocalDate,
  keyOfMonthIndex,
  localDateOf,
  periodBounds,
  startOfLocalDay
} from "./creditCardCycle.js";

/** Number of billing periods returned per page. */
export const BILLING_PAGE_SIZE = 12;

const ZERO = new Prisma.Decimal(0);

const ESTIMATE_ASSUMPTIONS = [
  "Average daily balance over the payment window, with the grace period lost on the whole balance",
  "Simple daily interest on a 365-day year",
  "No tax",
  "No installment, promotional or deferred-interest balances"
];

const NO_ESTIMATE: InterestEstimate = {
  status: "none",
  amount: null,
  projected: false,
  avoidAmount: null,
  assumptions: []
};

/** The columns of a ledger row that {@link toCardEntry} reads. */
export type CardLedgerRow = {
  type: "income" | "expense" | "transfer";
  accountId: string | null;
  transferToAccountId: string | null;
  accountAmount: Prisma.Decimal.Value | null;
  destinationAmount: Prisma.Decimal.Value | null;
  date: Date;
  creditCardKind: string | null;
};

/**
 * Reduces a ledger row to its effect on the card `accountId`. The signed `delta` comes from the same
 * {@link transactionBalanceDelta} as the account balance. Transfers in and all card income are credits; expenses and
 * transfers out are charges, except expenses classified `interest`.
 */
export function toCardEntry(row: CardLedgerRow, accountId: string): CardEntry {
  const delta = transactionBalanceDelta(row, accountId);
  if (row.type === "transfer" && row.transferToAccountId === accountId) {
    return { date: row.date, delta, role: "credit", creditKind: "transfer" };
  }
  if (row.type === "income") {
    const kinds: Record<string, CreditKind> = { payment: "payment", refund: "refund", cashback: "cashback" };
    return { date: row.date, delta, role: "credit", creditKind: kinds[row.creditCardKind ?? ""] ?? "other" };
  }
  const role = row.type === "expense" && row.creditCardKind === "interest" ? "interest" : "charge";
  return { date: row.date, delta, role };
}

const CREDIT_BREAKDOWN_KEY: Record<CreditKind, keyof CreditBreakdown> = {
  transfer: "transfers",
  payment: "payments",
  refund: "refunds",
  cashback: "cashback",
  other: "other"
};

function emptyBreakdown(): Record<keyof CreditBreakdown, Prisma.Decimal> {
  return { transfers: ZERO, payments: ZERO, refunds: ZERO, cashback: ZERO, other: ZERO };
}

function positive(value: Prisma.Decimal) {
  return value.isNegative() ? ZERO : value;
}

/** Reduces the account's cycle columns (plus the period overrides) to a {@link CycleConfig}, or `null` when the cycle isn't fully configured. */
export function toCycleConfig(account: CardBillingAccount, overrides?: PeriodOverrides): CycleConfig | null {
  const { statementClosingDay, paymentDueRule, paymentDueValue, billingTimeZone } = account;
  if (statementClosingDay == null || !paymentDueRule || paymentDueValue == null || !billingTimeZone) return null;
  return { statementClosingDay, paymentDueRule, paymentDueValue, billingTimeZone, overrides };
}

/**
 * Builds the full billing projection of one credit card from its configuration and ledger entries; pure and deterministic
 * for a given `now`. `metrics.balance` equals `calculateAccountBalance` over the same ledger. Periods run from the one
 * containing the earlier of the account's creation and its first entry up to the open period, newest first, `BILLING_PAGE_SIZE`
 * per 1-based `page`. A closed period's payment window runs from its closing to the later of the next closing and its own due date, so a payment made after the next closing but before the due date counts toward both statements (closing debts are cumulative, so the next statement already contains the unpaid remainder). `overrides` replaces the closing and/or due date of individual periods; everything else derives from the effective dates. A card without a complete cycle configuration returns metrics and no periods. All amounts are exact decimal strings.
 */
export function buildCardBilling(input: {
  account: CardBillingAccount;
  entries: CardEntry[];
  now: Date;
  page: number;
  overrides?: PeriodOverrides;
}): CreditCardBilling {
  const { account, now, page } = input;
  const entries = [...input.entries].sort((a, b) => a.date.getTime() - b.date.getTime());
  const times = entries.map((entry) => entry.date.getTime());
  const prefix = [new Prisma.Decimal(account.initialBalance)];
  for (const entry of entries) prefix.push(prefix[prefix.length - 1]!.plus(entry.delta));

  const balance = prefix[prefix.length - 1]!;
  const debt = positive(balance.negated());
  const limit = account.creditLimit == null ? null : new Prisma.Decimal(account.creditLimit);
  const available = limit ? limit.plus(balance) : null;
  const metrics = {
    currency: account.currency,
    balance: balance.toFixed(),
    debt: debt.toFixed(),
    creditBalance: positive(balance).toFixed(),
    creditLimit: limit ? limit.toFixed() : null,
    availableCredit: available ? available.toFixed() : null,
    utilizationPercent: limit && !limit.isZero() ? debt.div(limit).times(100).toFixed(2, Prisma.Decimal.ROUND_HALF_UP) : null,
    overLimit: available ? available.isNegative() : false
  };

  const config = toCycleConfig(account, input.overrides);
  if (!config) {
    return {
      accountId: account.id,
      configured: false,
      config: null,
      metrics,
      openPeriod: null,
      current: null,
      periods: [],
      page,
      pageSize: BILLING_PAGE_SIZE,
      totalPeriods: 0
    };
  }

  const zone = config.billingTimeZone;
  const rate = account.annualInterestRate == null ? null : new Prisma.Decimal(account.annualInterestRate);
  const fractionDigits = currencyFractionDigits(account.currency);

  const lowerBound = (instant: Date) => {
    const target = instant.getTime();
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (times[mid]! < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const firstInstant =
    entries.length > 0 && entries[0]!.date < account.createdAt ? entries[0]!.date : account.createdAt;
  const indexes = enumeratePeriodIndexes(config, firstInstant, now);
  const openIndex = indexes[indexes.length - 1]!;

  // Interest accrues only until the next closing, even when the due date falls later: it posts on the next statement.
  const estimateFor = (bounds: PeriodBounds, nextClose: Date, remaining: Prisma.Decimal, onTimeRemaining: Prisma.Decimal) => {
    if (!onTimeRemaining.gt(0)) return NO_ESTIMATE;
    if (!rate) return { ...NO_ESTIMATE, status: "unavailable" as const };

    const lastDay = closingDateOf(config, bounds.monthIndex + 1);
    let sum = ZERO;
    for (let day = addDays(bounds.closingDate, 1); daysBetween(day, lastDay) >= 0; day = addDays(day, 1)) {
      const dayEnd = startOfLocalDay(addDays(day, 1), zone);
      sum = sum.plus(dayEnd.getTime() <= now.getTime() ? positive(prefix[lowerBound(dayEnd)]!.negated()) : debt);
    }
    const projected = now.getTime() < bounds.dueInstant.getTime();
    return {
      status: "estimated" as const,
      amount: rate.times(sum).div(36500).toFixed(fractionDigits, Prisma.Decimal.ROUND_HALF_UP),
      projected,
      avoidAmount: (projected ? remaining : onTimeRemaining).toFixed(),
      assumptions: ESTIMATE_ASSUMPTIONS
    };
  };

  const rows = indexes.map((monthIndex): BillingPeriod => {
    const bounds = periodBounds(config, monthIndex);
    const override = config.overrides?.get(monthIndex);
    const base = {
      key: keyOfMonthIndex(monthIndex),
      endAdjusted: override?.closingDate !== undefined,
      dueAdjusted: override?.dueDate !== undefined,
      defaultEnd: formatLocalDate(defaultClosingDateOf(config, monthIndex)),
      defaultDue: formatLocalDate(defaultDueDateOf(config, monthIndex)),
      start: formatLocalDate(bounds.start),
      end: formatLocalDate(bounds.closingDate),
      startAt: bounds.startInstant.toISOString(),
      endAt: bounds.closeInstant.toISOString(),
      dueDate: formatLocalDate(bounds.dueDate)
    };
    const startIdx = lowerBound(bounds.startInstant);
    const endIdx = lowerBound(bounds.closeInstant);
    let interest = ZERO;
    for (let i = startIdx; i < endIdx; i++) {
      if (entries[i]!.role === "interest") interest = interest.minus(entries[i]!.delta);
    }

    if (monthIndex === openIndex) {
      return {
        ...base,
        status: "open",
        closingDebt: null,
        credits: "0",
        creditsBreakdown: { transfers: "0", payments: "0", refunds: "0", cashback: "0", other: "0" },
        remaining: null,
        onTimeRemaining: null,
        confirmedInterest: interest.toFixed(),
        estimate: NO_ESTIMATE
      };
    }

    const nextClose = periodBounds(config, monthIndex + 1).closeInstant;
    const onTimeEnd = lowerBound(bounds.dueInstant);
    const windowEnd = Math.max(lowerBound(nextClose), onTimeEnd);
    const closingDebt = positive(prefix[endIdx]!.negated());
    const breakdown = emptyBreakdown();
    let credits = ZERO;
    let onTimeCredits = ZERO;
    for (let i = endIdx; i < windowEnd; i++) {
      const entry = entries[i]!;
      if (entry.role !== "credit") continue;
      const key = CREDIT_BREAKDOWN_KEY[entry.creditKind ?? "other"];
      breakdown[key] = breakdown[key].plus(entry.delta);
      credits = credits.plus(entry.delta);
      if (i < onTimeEnd) onTimeCredits = onTimeCredits.plus(entry.delta);
    }
    const remaining = positive(closingDebt.minus(credits));
    const onTimeRemaining = positive(closingDebt.minus(onTimeCredits));

    let status: BillingPeriodStatus;
    if (closingDebt.isZero() || onTimeRemaining.isZero()) status = "paid";
    else if (remaining.isZero()) status = "paid_late";
    else if (now.getTime() >= bounds.dueInstant.getTime()) status = "overdue";
    else status = credits.isZero() ? "pending" : "partially_paid";

    return {
      ...base,
      status,
      closingDebt: closingDebt.toFixed(),
      credits: credits.toFixed(),
      creditsBreakdown: {
        transfers: breakdown.transfers.toFixed(),
        payments: breakdown.payments.toFixed(),
        refunds: breakdown.refunds.toFixed(),
        cashback: breakdown.cashback.toFixed(),
        other: breakdown.other.toFixed()
      },
      remaining: remaining.toFixed(),
      onTimeRemaining: onTimeRemaining.toFixed(),
      confirmedInterest: interest.toFixed(),
      estimate: estimateFor(bounds, nextClose, remaining, onTimeRemaining)
    };
  });

  const newestFirst = rows.reverse();
  const open = periodBounds(config, openIndex);
  const latestClosed = newestFirst[1];
  const today = localDateOf(now, zone);

  return {
    accountId: account.id,
    configured: true,
    config: {
      creditLimit: limit ? limit.toFixed() : null,
      statementClosingDay: config.statementClosingDay,
      paymentDueRule: config.paymentDueRule,
      paymentDueValue: config.paymentDueValue,
      billingTimeZone: zone,
      annualInterestRate: rate ? rate.toFixed() : null
    },
    metrics,
    openPeriod: {
      start: formatLocalDate(open.start),
      nextClosingDate: formatLocalDate(open.closingDate),
      nextDueDate: formatLocalDate(open.dueDate)
    },
    current: latestClosed
      ? {
          closingDate: latestClosed.end,
          dueDate: latestClosed.dueDate,
          remaining: latestClosed.remaining!,
          status: latestClosed.status,
          daysUntilDue: daysBetween(today, parseLocalDate(latestClosed.dueDate)),
          estimate: latestClosed.estimate
        }
      : null,
    periods: newestFirst.slice((page - 1) * BILLING_PAGE_SIZE, page * BILLING_PAGE_SIZE),
    page,
    pageSize: BILLING_PAGE_SIZE,
    totalPeriods: newestFirst.length
  };
}
