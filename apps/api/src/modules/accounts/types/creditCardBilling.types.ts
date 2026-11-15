import type { PaymentDueRule } from "@flowledger/shared";
import type { Prisma } from "@prisma/client";

/** A calendar date in some time zone; `m` is 1-12. */
export type LocalDate = { y: number; m: number; d: number };

/** The billing-cycle part of a card's configuration. */
export type CycleConfig = {
  statementClosingDay: number;
  paymentDueRule: PaymentDueRule;
  paymentDueValue: number;
  billingTimeZone: string;
};

/** Boundaries of one billing period, identified by the month (`monthIndex = year * 12 + month - 1`) of its closing date. */
export type PeriodBounds = {
  monthIndex: number;
  /** First local day of the period (the day after the previous closing date). */
  start: LocalDate;
  closingDate: LocalDate;
  dueDate: LocalDate;
  /** `close(N-1)`: inclusive start instant of the period. */
  startInstant: Date;
  /** `close(N)`: exclusive end instant of the period and inclusive start of its payment window. */
  closeInstant: Date;
  /** `due(N)`: exclusive end instant of the on-time part of the payment window. */
  dueInstant: Date;
};

/** How a credit entry is labelled in the informational breakdown. */
export type CreditKind = "transfer" | "payment" | "refund" | "cashback" | "other";

/** One ledger row reduced to its effect on a card: `delta` is the signed balance change in the card's currency. */
export type CardEntry = {
  date: Date;
  delta: Prisma.Decimal;
  role: "charge" | "credit" | "interest";
  /** Set when `role` is `credit`. */
  creditKind?: CreditKind;
};

/** The persisted card fields {@link buildCardBilling} needs. */
export type CardBillingAccount = {
  id: string;
  currency: string;
  initialBalance: Prisma.Decimal.Value;
  createdAt: Date;
  creditLimit: Prisma.Decimal.Value | null;
  statementClosingDay: number | null;
  paymentDueRule: PaymentDueRule | null;
  paymentDueValue: number | null;
  billingTimeZone: string | null;
  annualInterestRate: Prisma.Decimal.Value | null;
};
