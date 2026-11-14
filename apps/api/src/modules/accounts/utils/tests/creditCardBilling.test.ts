import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { calculateAccountBalance } from "../../../transactions/utils/transactionCalculations.js";
import type { CardBillingAccount, CardEntry, CreditKind } from "../../types/creditCardBilling.types.js";
import { BILLING_PAGE_SIZE, buildCardBilling, toCardEntry } from "../creditCardBilling.js";

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
/** Local noon in America/Mexico_City (UTC-6, no DST). */
const at = (day: string) => new Date(`${day}T18:00:00Z`);

const charge = (day: string, amount: number): CardEntry => ({ date: at(day), delta: D(-amount), role: "charge" });
const credit = (day: string, amount: number, creditKind: CreditKind = "transfer"): CardEntry => ({
  date: at(day),
  delta: D(amount),
  role: "credit",
  creditKind
});
const interest = (day: string, amount: number): CardEntry => ({ date: at(day), delta: D(-amount), role: "interest" });

function account(over: Partial<CardBillingAccount> = {}): CardBillingAccount {
  return {
    id: "card-1",
    currency: "MXN",
    initialBalance: "0",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    creditLimit: "30000",
    statementClosingDay: 20,
    paymentDueRule: "day_of_next_month",
    paymentDueValue: 20,
    billingTimeZone: "America/Mexico_City",
    annualInterestRate: "60",
    ...over
  };
}

function build(entries: CardEntry[], now: string, over: Partial<CardBillingAccount> = {}, page = 1) {
  return buildCardBilling({ account: account(over), entries, now: at(now), page });
}

const period = (billing: ReturnType<typeof build>, closing: string) => {
  const found = billing.periods.find((p) => p.end === closing);
  if (!found) throw new Error(`no period closing ${closing}`);
  return found;
};

describe("metrics (design rows 1, 2, 15 and card metric scenarios)", () => {
  it("derives debt, available credit and utilization after a purchase", () => {
    const { metrics } = build([charge("2026-10-01", 5000)], "2026-10-02");
    expect(metrics).toMatchObject({
      balance: "-5000",
      debt: "5000",
      creditBalance: "0",
      availableCredit: "25000",
      utilizationPercent: "16.67",
      overLimit: false
    });
  });

  it("marks over limit with negative available credit", () => {
    const { metrics } = build([charge("2026-10-01", 31000)], "2026-10-02");
    expect(metrics).toMatchObject({ availableCredit: "-1000", overLimit: true, utilizationPercent: "103.33" });
  });

  it("reports a credit balance and available credit above the limit", () => {
    const { metrics } = build([], "2026-10-02", { initialBalance: "500" });
    expect(metrics).toMatchObject({ debt: "0", creditBalance: "500", availableCredit: "30500" });
  });

  it("omits limit-derived metrics when no limit is set", () => {
    const { metrics } = build([charge("2026-10-01", 100)], "2026-10-02", { creditLimit: null });
    expect(metrics).toMatchObject({ creditLimit: null, availableCredit: null, utilizationPercent: null, overLimit: false });
  });

  it("equals calculateAccountBalance over the same rows", () => {
    const rows = [
      { accountId: "card-1", transferToAccountId: null, type: "expense" as const, accountAmount: "123.45", destinationAmount: null },
      { accountId: "debit", transferToAccountId: "card-1", type: "transfer" as const, accountAmount: "50", destinationAmount: "50.5" },
      { accountId: "card-1", transferToAccountId: null, type: "income" as const, accountAmount: "7.07", destinationAmount: null }
    ];
    const entries = rows.map((row) => toCardEntry({ ...row, date: at("2026-10-05"), creditCardKind: null }, "card-1"));
    expect(build(entries, "2026-10-06", { initialBalance: "10" }).metrics.balance).toBe(
      calculateAccountBalance("card-1", rows, "10").toFixed()
    );
  });

  it("sums exactly without float drift", () => {
    const entries = [charge("2026-10-01", 0.1), charge("2026-10-02", 0.2)];
    expect(build(entries, "2026-10-03").metrics.debt).toBe("0.3");
  });
});

describe("closing debt, windows and statuses (design rows 3-6, 11, 12)", () => {
  const ledger = [
    charge("2026-10-01", 5000),
    credit("2026-10-05", 500, "refund"),
    credit("2026-10-10", 1000),
    charge("2026-10-25", 2000)
  ];

  it("counts pre-closing credits once and keeps later purchases out of the closed period", () => {
    const billing = build(ledger, "2026-10-26");
    expect(period(billing, "2026-10-20")).toMatchObject({ closingDebt: "3500", credits: "0", remaining: "3500" });
    expect(billing.metrics.debt).toBe("5500");
  });

  it("is partially_paid after a 2000 transfer in the window (row 5)", () => {
    const billing = build([...ledger, credit("2026-11-01", 2000)], "2026-11-05");
    expect(period(billing, "2026-10-20")).toMatchObject({
      status: "partially_paid",
      credits: "2000",
      creditsBreakdown: { transfers: "2000", payments: "0", refunds: "0", cashback: "0", other: "0" },
      remaining: "1500"
    });
    expect(billing.metrics.debt).toBe("3500");
    expect(billing.current).toMatchObject({ closingDate: "2026-10-20", remaining: "1500", status: "partially_paid" });
  });

  it("is paid once fully covered, leaving only the post-closing purchase as debt (row 6)", () => {
    const billing = build([...ledger, credit("2026-11-01", 2000), credit("2026-11-10", 1500)], "2026-11-15");
    expect(period(billing, "2026-10-20")).toMatchObject({ status: "paid", remaining: "0" });
    expect(billing.metrics.debt).toBe("2000");
  });

  it("recalculates when the payment is edited then deleted (row 11)", () => {
    const edited = build([...ledger, credit("2026-11-01", 1000), credit("2026-11-10", 1500)], "2026-11-15");
    expect(period(edited, "2026-10-20").remaining).toBe("1000");
    expect(edited.metrics.debt).toBe("3000");
    const deleted = build([...ledger, credit("2026-11-10", 1500)], "2026-11-15");
    expect(period(deleted, "2026-10-20").remaining).toBe("2000");
    expect(deleted.metrics.debt).toBe("4000");
  });

  it("recalculates closed periods for a backdated purchase (row 12)", () => {
    const billing = build([...ledger, charge("2026-10-15", 800)], "2026-12-01");
    expect(period(billing, "2026-10-20").closingDebt).toBe("4300");
  });

  it("is pending before the due date with no credits", () => {
    expect(period(build(ledger, "2026-11-05"), "2026-10-20").status).toBe("pending");
  });

  it("treats a non-positive balance at closing as paid with closing debt 0", () => {
    const billing = build([], "2026-11-25", { initialBalance: "200" });
    expect(period(billing, "2026-11-20")).toMatchObject({ closingDebt: "0", status: "paid", remaining: "0" });
  });

  it("does not count a transfer moved away from the card", () => {
    const moved = build(ledger, "2026-11-05");
    expect(period(moved, "2026-10-20").credits).toBe("0");
  });
});

describe("payment windows from the billing spec", () => {
  const base = [charge("2026-12-01", 10000), charge("2026-12-25", 2000)];

  it("partial payment of 6000 (limit 30000)", () => {
    const billing = build([...base, credit("2027-01-10", 6000)], "2027-01-12");
    expect(period(billing, "2026-12-20")).toMatchObject({ credits: "6000", remaining: "4000", status: "partially_paid" });
    expect(billing.metrics).toMatchObject({ debt: "6000", availableCredit: "24000" });
  });

  it("full payment of 10000 leaves the newer purchases as debt", () => {
    const billing = build([...base, credit("2027-01-10", 10000)], "2027-01-12");
    expect(period(billing, "2026-12-20")).toMatchObject({ status: "paid", remaining: "0" });
    expect(billing.metrics.debt).toBe("2000");
  });

  it("an external payment equals a transfer and shows under payments", () => {
    const billing = build([...base, credit("2027-01-10", 6000, "payment")], "2027-01-12");
    expect(period(billing, "2026-12-20")).toMatchObject({
      remaining: "4000",
      creditsBreakdown: { transfers: "0", payments: "6000", refunds: "0", cashback: "0", other: "0" }
    });
  });

  it("a refund and cashback after closing reduce remaining to 8950", () => {
    const billing = build([...base, credit("2027-01-10", 1000, "refund"), credit("2027-01-11", 50, "cashback")], "2027-01-12");
    expect(period(billing, "2026-12-20")).toMatchObject({
      credits: "1050",
      creditsBreakdown: { refunds: "1000", cashback: "50" },
      remaining: "8950"
    });
  });

  it("overpayment gives a credit balance (row 15)", () => {
    const billing = build([...base, credit("2027-01-10", 15000)], "2027-01-12");
    expect(period(billing, "2026-12-20")).toMatchObject({ status: "paid", remaining: "0" });
    expect(billing.metrics).toMatchObject({ debt: "0", creditBalance: "3000", availableCredit: "33000" });
  });

  it("uses the persisted destination amount for a cross-currency payment (row 14)", () => {
    const billing = build([...base, credit("2027-01-10", 5400)], "2027-01-12");
    expect(period(billing, "2026-12-20").credits).toBe("5400");
  });

  it("classifies an unlabeled income as other credit", () => {
    const billing = build([...base, credit("2027-01-10", 20, "other")], "2027-01-12");
    expect(period(billing, "2026-12-20").creditsBreakdown.other).toBe("20");
  });
});

describe("multiple unpaid periods (rows 7-8)", () => {
  const ledger = [
    charge("2027-01-10", 10000),
    credit("2027-02-01", 4000),
    charge("2027-02-05", 3000),
    credit("2027-03-01", 9000)
  ];

  it("counts each payment toward one period only", () => {
    const billing = build(ledger, "2027-03-02", { createdAt: new Date("2027-01-01T00:00:00Z") });
    const a = period(billing, "2027-01-20");
    const b = period(billing, "2027-02-20");
    expect(a).toMatchObject({ closingDebt: "10000", credits: "4000", remaining: "6000", status: "overdue" });
    expect(b).toMatchObject({ closingDebt: "9000", credits: "9000", remaining: "0", status: "paid" });
    expect(D(a.credits).plus(b.credits).toFixed()).toBe("13000");
    expect(billing.current).toMatchObject({ closingDate: "2027-02-20", remaining: "0" });
  });

  it("is overdue from the start of the day after the due date", () => {
    const ledgerNoMar = ledger.slice(0, 3);
    const justBefore = buildCardBilling({
      account: account({ createdAt: new Date("2027-01-01T00:00:00Z") }),
      entries: ledgerNoMar,
      now: new Date("2027-02-21T05:59:00Z"),
      page: 1
    });
    const justAfter = buildCardBilling({
      account: account({ createdAt: new Date("2027-01-01T00:00:00Z") }),
      entries: ledgerNoMar,
      now: new Date("2027-02-21T06:00:00Z"),
      page: 1
    });
    expect(period(justBefore, "2027-01-20").status).toBe("partially_paid");
    expect(period(justAfter, "2027-01-20").status).toBe("overdue");
  });

  it("turns an overdue period paid_late once paid (closing 31, 20 days after)", () => {
    const config = { statementClosingDay: 31, paymentDueRule: "days_after_closing" as const, paymentDueValue: 20 };
    const entries = [charge("2027-01-15", 6000)];
    const overdue = build(entries, "2027-02-21", { ...config, createdAt: new Date("2027-01-01T00:00:00Z") });
    expect(period(overdue, "2027-01-31")).toMatchObject({ dueDate: "2027-02-20", status: "overdue", remaining: "6000" });
    const late = build([...entries, credit("2027-02-25", 6000)], "2027-02-26", {
      ...config,
      createdAt: new Date("2027-01-01T00:00:00Z")
    });
    expect(period(late, "2027-01-31").status).toBe("paid_late");
  });
});

describe("interest estimate and confirmed interest (rows 9-10)", () => {
  const created = new Date("2027-01-01T00:00:00Z");
  const ledger = [charge("2027-01-10", 10000), credit("2027-02-01", 4000), charge("2027-02-05", 3000)];

  it("estimates 456.99 for the partially paid period once overdue", () => {
    const billing = build(ledger, "2027-02-21", { createdAt: created });
    expect(period(billing, "2027-01-20").estimate).toMatchObject({
      status: "estimated",
      amount: "456.99",
      projected: false,
      avoidAmount: "6000"
    });
    expect(period(billing, "2027-01-20").estimate.assumptions.length).toBeGreaterThan(0);
    expect(billing.metrics.debt).toBe("9000");
  });

  it("projects the same estimate before the due date", () => {
    const billing = build(ledger, "2027-02-10", { createdAt: created });
    expect(billing.current).toMatchObject({ closingDate: "2027-01-20", status: "partially_paid" });
    expect(billing.current!.estimate).toMatchObject({ amount: "456.99", projected: true, avoidAmount: "6000" });
  });

  it("shows no estimate when paid in time", () => {
    const billing = build([...ledger, credit("2027-02-15", 6000)], "2027-02-21", { createdAt: created });
    expect(period(billing, "2027-01-20").estimate).toMatchObject({ status: "none", amount: null });
  });

  it("is unavailable without a rate", () => {
    const billing = build(ledger, "2027-02-21", { createdAt: created, annualInterestRate: null });
    expect(period(billing, "2027-01-20").estimate).toMatchObject({ status: "unavailable", amount: null });
  });

  it("rounds to the currency precision: 2 decimals for MXN, 0 for JPY", () => {
    const jpy = build(ledger, "2027-02-21", { createdAt: created, currency: "JPY" });
    expect(period(jpy, "2027-01-20").estimate.amount).toBe("457");
  });

  it("reports confirmed interest in its own period and adds it to debt", () => {
    const billing = build([...ledger, interest("2027-02-20", 457)], "2027-02-21", { createdAt: created });
    expect(period(billing, "2027-02-20")).toMatchObject({ confirmedInterest: "457", closingDebt: "9457" });
    expect(billing.metrics).toMatchObject({ debt: "9457", availableCredit: "20543" });
  });
});

describe("period listing", () => {
  it("returns an open period with null figures and an openPeriod summary", () => {
    const billing = build([charge("2026-10-01", 100)], "2026-10-10", { createdAt: new Date("2026-09-25T00:00:00Z") });
    expect(billing.periods).toHaveLength(1);
    expect(billing.periods[0]).toMatchObject({ status: "open", closingDebt: null, remaining: null });
    expect(billing.openPeriod).toEqual({ start: "2026-09-21", nextClosingDate: "2026-10-20", nextDueDate: "2026-11-20" });
    expect(billing.current).toBeNull();
  });

  it("starts at the period of the earliest entry when it predates account creation", () => {
    const billing = build([charge("2026-07-01", 100)], "2026-10-10");
    expect(billing.periods[billing.periods.length - 1]!.start).toBe("2026-06-21");
  });

  it("pages newest first, 12 per page", () => {
    const options = { createdAt: new Date("2024-01-05T00:00:00Z") };
    const first = build([], "2026-12-10", options, 1);
    const third = build([], "2026-12-10", options, 3);
    expect(first.totalPeriods).toBe(36);
    expect(first.periods).toHaveLength(BILLING_PAGE_SIZE);
    expect(first.periods[0]!.status).toBe("open");
    expect(third.periods).toHaveLength(12);
    expect(third.periods[11]!.start).toBe("2023-12-21");
    expect(build([], "2026-12-10", options, 4).periods).toEqual([]);
  });

  it("returns metrics and no periods for an unconfigured card", () => {
    const billing = build([charge("2026-10-01", 100)], "2026-10-10", {
      statementClosingDay: null,
      paymentDueRule: null,
      paymentDueValue: null,
      billingTimeZone: null
    });
    expect(billing).toMatchObject({ configured: false, config: null, openPeriod: null, current: null, periods: [], totalPeriods: 0 });
    expect(billing.metrics.debt).toBe("100");
  });

  it("computes days until due in the billing zone", () => {
    const billing = build([charge("2026-10-01", 100)], "2026-11-15");
    expect(billing.current).toMatchObject({ closingDate: "2026-10-20", dueDate: "2026-11-20", daysUntilDue: 5 });
  });
});

describe("toCardEntry", () => {
  const row = (over: Record<string, unknown>) => ({
    type: "expense" as const,
    accountId: "card-1",
    transferToAccountId: null,
    accountAmount: "10",
    destinationAmount: null,
    date: at("2026-10-05"),
    creditCardKind: null,
    ...over
  });

  it("maps a transfer into the card to a transfer credit using destinationAmount", () => {
    const entry = toCardEntry(row({ type: "transfer", accountId: "debit", transferToAccountId: "card-1", destinationAmount: "5400" }), "card-1");
    expect(entry).toMatchObject({ role: "credit", creditKind: "transfer" });
    expect(entry.delta.toFixed()).toBe("5400");
  });

  it("maps a transfer out of the card to a charge", () => {
    const entry = toCardEntry(row({ type: "transfer", transferToAccountId: "debit", destinationAmount: "10" }), "card-1");
    expect(entry).toMatchObject({ role: "charge" });
    expect(entry.delta.toFixed()).toBe("-10");
  });

  it.each([
    ["payment", "payment"],
    ["refund", "refund"],
    ["cashback", "cashback"],
    [null, "other"]
  ])("maps income kind %s to credit kind %s", (kind, expected) => {
    expect(toCardEntry(row({ type: "income", creditCardKind: kind }), "card-1")).toMatchObject({ role: "credit", creditKind: expected });
  });

  it("maps an interest expense to interest and other expenses to charges", () => {
    expect(toCardEntry(row({ creditCardKind: "interest" }), "card-1").role).toBe("interest");
    expect(toCardEntry(row({}), "card-1").role).toBe("charge");
  });
});
