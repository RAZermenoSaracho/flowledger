import type { NotificationType } from "@flowledger/shared";

const CREDIT_CARD_LABELS: Partial<Record<NotificationType, string>> = {
  credit_card_period_closed: "Credit card · Statement closed",
  credit_card_payment_due_soon: "Credit card · Payment due soon",
  credit_card_period_partially_paid: "Credit card · Partially paid",
  credit_card_period_paid: "Credit card · Paid",
  credit_card_payment_overdue: "Credit card · Payment overdue"
};

/** Whether `type` is one of the five credit-card billing reminders. */
export function isCreditCardNotification(type: NotificationType): boolean {
  return type in CREDIT_CARD_LABELS;
}

/** Short badge label of a credit-card reminder type, or `null` for any other notification. */
export function creditCardNotificationLabel(type: NotificationType): string | null {
  return CREDIT_CARD_LABELS[type] ?? null;
}
