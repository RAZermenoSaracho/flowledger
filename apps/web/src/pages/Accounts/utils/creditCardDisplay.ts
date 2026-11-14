import type { BillingPeriodStatus } from "@flowledger/shared";

const STATUS_LABELS: Record<BillingPeriodStatus, string> = {
  open: "Open",
  pending: "Pending",
  partially_paid: "Partially paid",
  paid: "Paid",
  paid_late: "Paid late",
  overdue: "Overdue"
};

/** Human label of a billing period status; an overdue period that is not the current one reads as carried into later periods. */
export function periodStatusLabel(status: BillingPeriodStatus, carried = false): string {
  return status === "overdue" && carried ? "Overdue (carried into later periods)" : STATUS_LABELS[status];
}

/** Tailwind text classes that tint a status: red for overdue, amber for pending/partial, green for paid. */
export function periodStatusClass(status: BillingPeriodStatus, carried = false): string {
  if (status === "overdue") {
    return carried ? "text-slate-500 dark:text-slate-400" : "font-semibold text-red-600 dark:text-red-400";
  }
  if (status === "pending" || status === "partially_paid") return "text-amber-700 dark:text-amber-300";
  if (status === "paid" || status === "paid_late") return "text-pine dark:text-emerald-300";
  return "text-slate-600 dark:text-slate-300";
}
