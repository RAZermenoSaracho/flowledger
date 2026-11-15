import { describe, expect, it } from "vitest";
import { creditCardNotificationLabel, isCreditCardNotification } from "../notificationLabel";

describe("notificationLabel", () => {
  it("labels the five card reminders", () => {
    expect(creditCardNotificationLabel("credit_card_period_closed")).toBe("Credit card · Statement closed");
    expect(creditCardNotificationLabel("credit_card_payment_due_soon")).toBe("Credit card · Payment due soon");
    expect(creditCardNotificationLabel("credit_card_period_partially_paid")).toBe("Credit card · Partially paid");
    expect(creditCardNotificationLabel("credit_card_period_paid")).toBe("Credit card · Paid");
    expect(creditCardNotificationLabel("credit_card_payment_overdue")).toBe("Credit card · Payment overdue");
  });

  it("returns null and false for other types", () => {
    expect(creditCardNotificationLabel("group_member_added")).toBeNull();
    expect(isCreditCardNotification("group_member_added")).toBe(false);
    expect(isCreditCardNotification("credit_card_period_paid")).toBe(true);
  });
});
