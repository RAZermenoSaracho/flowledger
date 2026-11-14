import type { BillingPeriod, CreditCardBilling } from "@flowledger/shared";
import type { NotificationType } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { loadCardEntries } from "../../accounts/services/creditCard.read.service.js";
import { daysBetween, formatLocalDate, localDateOf } from "../../accounts/utils/creditCardCycle.js";
import { buildCardBilling } from "../../accounts/utils/creditCardBilling.js";
import type { NotificationInput } from "../types/notifications.types.js";
import { moneyText } from "../utils/moneyText.js";
import { createNotifications } from "./create.service.js";

const DUE_SOON_DAYS = 3;

const TITLES: Record<string, string> = {
  credit_card_period_closed: "Credit card statement closed",
  credit_card_payment_due_soon: "Credit card payment due soon",
  credit_card_period_partially_paid: "Credit card partially paid",
  credit_card_period_paid: "Credit card paid",
  credit_card_payment_overdue: "Credit card payment overdue"
};

function parseDay(value: string) {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

/**
 * Pure evaluation of one card's billing into the notifications that currently hold (see the credit-card-reminders spec):
 * closed / due soon / partially paid / paid for the latest closed period, overdue for the most recent period past its due date.
 * Each carries a `cc:<type>:<accountId>:<closingDate>` dedupe key with no amounts, so later history edits never resend an event.
 */
export function evaluateCardReminders(
  userId: string,
  cardName: string,
  billing: CreditCardBilling,
  now: Date
): NotificationInput[] {
  if (!billing.configured || !billing.config) return [];
  const zone = billing.config.billingTimeZone;
  const today = localDateOf(now, zone);
  const todayText = formatLocalDate(today);
  const closed = billing.periods.filter((period) => period.status !== "open");
  const out: NotificationInput[] = [];

  const push = (type: NotificationType, period: BillingPeriod, dueText: string) => {
    const closingDebt = period.closingDebt ?? "0";
    const remaining = period.remaining ?? "0";
    const currency = billing.metrics.currency;
    out.push({
      userId,
      type,
      title: TITLES[type]!,
      message:
        `${cardName}: closing debt ${moneyText(closingDebt, currency)}, remaining ${moneyText(remaining, currency)}, ` +
        `due ${period.dueDate}, ${dueText}, status ${period.status}.`,
      metadata: { accountId: billing.accountId, closingDate: period.end },
      dedupeKey: `cc:${type}:${billing.accountId}:${period.end}`
    });
  };

  const latest = closed[0];
  if (latest && latest.closingDebt != null && latest.remaining != null) {
    const closingDebt = Number(latest.closingDebt);
    const remaining = Number(latest.remaining);
    const daysLeft = daysBetween(today, parseDay(latest.dueDate));
    if (closingDebt > 0) {
      push("credit_card_period_closed", latest, `${daysLeft} days remaining`);
      if (remaining === 0) push("credit_card_period_paid", latest, `${daysLeft} days remaining`);
    }
    if (remaining > 0) {
      if (daysLeft >= 0 && daysLeft <= DUE_SOON_DAYS) {
        push("credit_card_payment_due_soon", latest, `${daysLeft} days remaining`);
      }
      if (Number(latest.credits) > 0) {
        push("credit_card_period_partially_paid", latest, `${daysLeft} days remaining`);
      }
    }
  }

  const pastDue = closed.find((period) => period.dueDate < todayText);
  if (pastDue && Number(pastDue.remaining ?? 0) > 0 && Number(billing.metrics.debt) > 0) {
    const overdueDays = daysBetween(parseDay(pastDue.dueDate), today);
    push("credit_card_payment_overdue", pastDue, `${overdueDays} days overdue`);
  }
  return out;
}

/**
 * Evaluates every active, fully configured credit card and inserts the reminders that hold at `now`. Idempotent: the
 * `(userId, dedupeKey)` unique constraint makes repeated runs and concurrent workers insert each event once.
 * Only the card's owner is notified. Returns nothing; failures propagate to the caller.
 */
export async function runCreditCardReminders(now: Date = new Date()): Promise<void> {
  const cards = await prisma.account.findMany({
    where: {
      type: "credit_card",
      isArchived: false,
      statementClosingDay: { not: null },
      paymentDueRule: { not: null },
      paymentDueValue: { not: null },
      billingTimeZone: { not: null }
    }
  });
  const byUser = new Map<string, typeof cards>();
  for (const card of cards) byUser.set(card.userId, [...(byUser.get(card.userId) ?? []), card]);

  const inputs: NotificationInput[] = [];
  for (const [userId, userCards] of byUser) {
    const entries = await loadCardEntries(userId, userCards.map((card) => card.id));
    for (const card of userCards) {
      const billing = buildCardBilling({ account: card, entries: entries.get(card.id) ?? [], now, page: 1 });
      inputs.push(...evaluateCardReminders(userId, card.name, billing, now));
    }
  }
  await createNotifications(prisma, inputs);
}
