import type { BillingPeriod, CreditCardBilling } from "@flowledger/shared";

const noEstimate = { status: "none" as const, amount: null, projected: false, avoidAmount: null, assumptions: [] };
const zeroBreakdown = { transfers: "0", payments: "0", refunds: "0", cashback: "0", other: "0" };

/** A closed billing period with sensible defaults; override any field. */
export function makePeriod(overrides: Partial<BillingPeriod> = {}): BillingPeriod {
  const start = overrides.start ?? "2027-01-21";
  const end = overrides.end ?? "2027-02-20";
  const dayAfterEnd = new Date(`${end}T00:00:00.000Z`);
  dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);
  return {
    key: end.slice(0, 7),
    endAdjusted: false,
    dueAdjusted: false,
    defaultEnd: end,
    defaultDue: overrides.dueDate ?? "2027-03-20",
    startAt: `${start}T06:00:00.000Z`,
    endAt: `${dayAfterEnd.toISOString().slice(0, 10)}T06:00:00.000Z`,
    start: "2027-01-21",
    end: "2027-02-20",
    dueDate: "2027-03-20",
    status: "partially_paid",
    closingDebt: "9000",
    credits: "5000",
    creditsBreakdown: { ...zeroBreakdown, transfers: "4000", refunds: "1000" },
    remaining: "4000",
    onTimeRemaining: "4000",
    confirmedInterest: "0",
    estimate: noEstimate,
    ...overrides
  };
}

/** A configured card billing response with sensible defaults; override any field. */
export function makeBilling(overrides: Partial<CreditCardBilling> = {}): CreditCardBilling {
  return {
    accountId: "card-1",
    configured: true,
    config: {
      creditLimit: "30000",
      statementClosingDay: 20,
      paymentDueRule: "day_of_next_month",
      paymentDueValue: 20,
      billingTimeZone: "America/Mexico_City",
      annualInterestRate: "60"
    },
    metrics: {
      currency: "MXN",
      balance: "-9000",
      debt: "9000",
      creditBalance: "0",
      creditLimit: "30000",
      availableCredit: "21000",
      utilizationPercent: "30",
      overLimit: false
    },
    openPeriod: { start: "2027-02-21", nextClosingDate: "2027-03-20", nextDueDate: "2027-04-20" },
    current: {
      closingDate: "2027-02-20",
      dueDate: "2027-03-20",
      remaining: "4000",
      status: "partially_paid",
      daysUntilDue: 5,
      estimate: {
        status: "estimated",
        amount: "123.45",
        projected: true,
        avoidAmount: "4000",
        assumptions: ["Assumes no further payments"]
      }
    },
    periods: [
      makePeriod({ start: "2027-02-21", end: "2027-03-20", dueDate: "2027-04-20", status: "open", closingDebt: null, remaining: null, onTimeRemaining: null, credits: "0", creditsBreakdown: zeroBreakdown }),
      makePeriod(),
      makePeriod({ start: "2026-12-21", end: "2027-01-20", dueDate: "2027-02-20", status: "overdue", closingDebt: "6000", credits: "0", creditsBreakdown: zeroBreakdown, remaining: "6000" })
    ],
    page: 1,
    pageSize: 12,
    totalPeriods: 3,
    ...overrides
  };
}
