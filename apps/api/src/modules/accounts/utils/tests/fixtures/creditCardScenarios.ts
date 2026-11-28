import { Prisma } from "@prisma/client";
import type {
  CardBillingAccount,
  CardEntry,
  CreditKind
} from "../../../types/creditCardBilling.types.js";

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

const charge = (iso: string, amount: number): CardEntry => ({
  date: new Date(iso),
  delta: D(-amount),
  role: "charge"
});
const credit = (
  iso: string,
  amount: number,
  creditKind: CreditKind = "transfer"
): CardEntry => ({
  date: new Date(iso),
  delta: D(amount),
  role: "credit",
  creditKind
});
const interest = (iso: string, amount: number): CardEntry => ({
  date: new Date(iso),
  delta: D(-amount),
  role: "interest"
});

/** A reproducible card, ledger and clock used to compare billing output across code versions. */
export type BillingScenario = {
  account: CardBillingAccount;
  entries: CardEntry[];
  now: Date;
};

const base: CardBillingAccount = {
  id: "card-1",
  currency: "MXN",
  initialBalance: "0",
  createdAt: new Date("2026-08-15T00:00:00Z"),
  creditLimit: "50000",
  statementClosingDay: 20,
  paymentDueRule: "day_of_next_month",
  paymentDueValue: 20,
  billingTimeZone: "America/Mexico_City",
  annualInterestRate: "60"
};

/** Named scenarios covering plain cycles, day-31 clamping across a leap year, DST zones and year ends. */
export const BILLING_SCENARIOS: Record<string, BillingScenario> = {
  mexicoMixedLedger: {
    account: base,
    now: new Date("2026-12-28T18:00:00Z"),
    entries: [
      charge("2026-09-10T18:00:00Z", 4000),
      charge("2026-09-21T06:00:00Z", 1500),
      credit("2026-10-05T18:00:00Z", 2000),
      charge("2026-10-19T18:00:00Z", 3200),
      credit("2026-10-22T18:00:00Z", 5500, "payment"),
      interest("2026-10-21T18:00:00Z", 120),
      charge("2026-11-20T05:59:59Z", 700),
      charge("2026-11-20T06:00:00Z", 800),
      credit("2026-11-22T18:00:00Z", 300, "refund"),
      credit("2026-12-21T18:00:00Z", 1000, "cashback"),
      charge("2026-12-26T18:00:00Z", 2500)
    ]
  },
  leapYearDay31NewYork: {
    account: {
      ...base,
      id: "card-2",
      currency: "USD",
      createdAt: new Date("2027-10-01T00:00:00Z"),
      statementClosingDay: 31,
      paymentDueRule: "days_after_closing",
      paymentDueValue: 20,
      billingTimeZone: "America/New_York",
      annualInterestRate: "24"
    },
    now: new Date("2028-03-15T16:00:00Z"),
    entries: [
      charge("2027-10-30T12:00:00Z", 100),
      charge("2027-12-31T04:59:59Z", 50),
      charge("2028-01-01T05:00:00Z", 75.25),
      credit("2028-01-15T12:00:00Z", 60),
      charge("2028-02-29T03:00:00Z", 40),
      credit("2028-03-05T12:00:00Z", 200),
      charge("2028-03-12T06:30:00Z", 30)
    ]
  },
  madridYearEndDst: {
    account: {
      ...base,
      id: "card-3",
      currency: "EUR",
      createdAt: new Date("2026-09-01T00:00:00Z"),
      statementClosingDay: 29,
      paymentDueRule: "days_after_closing",
      paymentDueValue: 14,
      billingTimeZone: "Europe/Madrid",
      annualInterestRate: null
    },
    now: new Date("2027-04-10T10:00:00Z"),
    entries: [
      charge("2026-10-27T23:30:00Z", 80),
      charge("2026-12-31T22:59:00Z", 25),
      credit("2027-01-05T09:00:00Z", 100),
      charge("2027-03-27T23:30:00Z", 10),
      charge("2027-03-28T00:30:00Z", 12),
      credit("2027-04-02T09:00:00Z", 20)
    ]
  }
};
