import type { BillingPeriodStatus, PaymentDueRule } from "@flowledger/shared";

const STATUS_LABELS: Record<BillingPeriodStatus, string> = {
  open: "Open",
  pending: "Pending",
  partially_paid: "Partially paid",
  paid: "Paid",
  paid_late: "Paid late",
  overdue: "Overdue"
};

/** Human label of a billing period status; an overdue period that is not the current one reads as carried into later periods. */
export function periodStatusLabel(
  status: BillingPeriodStatus,
  carried = false
): string {
  return status === "overdue" && carried
    ? "Overdue (carried into later periods)"
    : STATUS_LABELS[status];
}

/** Tailwind text classes that tint a status: red for overdue, amber for pending/partial, green for paid. */
export function periodStatusClass(
  status: BillingPeriodStatus,
  carried = false
): string {
  if (status === "overdue") {
    return carried
      ? "text-slate-500 dark:text-slate-400"
      : "font-semibold text-red-600 dark:text-red-400";
  }
  if (status === "pending" || status === "partially_paid")
    return "text-amber-700 dark:text-amber-300";
  if (status === "paid" || status === "paid_late")
    return "text-pine dark:text-emerald-300";
  return "text-slate-600 dark:text-slate-300";
}

const utcDate = (y: number, m: number, d: number) =>
  new Date(
    Date.UTC(y, m, Math.min(d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()))
  );

/**
 * The next statement closing on or after `today` and its payment due date under the given rule, mirroring the
 * billing engine: a closing day past the month's end closes on its last day (31 → Feb 28/29), `day_of_next_month`
 * clamps the same way, and `days_after_closing` counts calendar days. Returns `null` while the inputs are incomplete
 * or out of range (`maxValue`). Dates are UTC midnights of the local calendar day.
 */
export function billingDatesExample(input: {
  closingDay: number;
  rule: PaymentDueRule | "";
  value: number;
  maxValue: number;
  today?: Date;
}): { closing: Date; due: Date; days: number } | null {
  const { closingDay, rule, value, maxValue, today = new Date() } = input;
  const valid = (n: number, max: number) =>
    Number.isInteger(n) && n >= 1 && n <= max;
  if (!rule || !valid(closingDay, 31) || !valid(value, maxValue)) return null;

  const start = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  let closing = utcDate(today.getFullYear(), today.getMonth(), closingDay);
  if (closing.getTime() < start)
    closing = utcDate(today.getFullYear(), today.getMonth() + 1, closingDay);
  const due =
    rule === "day_of_next_month"
      ? utcDate(closing.getUTCFullYear(), closing.getUTCMonth() + 1, value)
      : new Date(closing.getTime() + value * 86_400_000);
  return {
    closing,
    due,
    days: Math.round((due.getTime() - closing.getTime()) / 86_400_000)
  };
}
