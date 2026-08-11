import { describe, expect, it } from "vitest";
import type { Notification } from "../../../types/notifications.types";
import { notificationTarget } from "../notificationTarget";

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    userId: "user-1",
    type: "group_member_added",
    title: "title",
    message: "message",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

// Every current NotificationType is handled by an explicit branch in
// notificationTarget, so its trailing transactionId/groupId fallback is
// unreachable through a real notification today — it only guards against a
// future type added without a matching branch. This cast exercises that
// defensive path directly, since it's still real code worth covering.
const unhandledType = "unhandled_future_type" as unknown as Notification["type"];

describe("notificationTarget", () => {
  it("links group_member_added to the group's groups page with groupId when present", () => {
    const notification = makeNotification({
      type: "group_member_added",
      metadata: { groupId: "group-1" }
    });
    expect(notificationTarget(notification)).toBe("/groups?groupId=group-1");
  });

  it("falls back to the plain groups route when group_member_added has no groupId", () => {
    const notification = makeNotification({ type: "group_member_added", metadata: {} });
    expect(notificationTarget(notification)).toBe("/groups");
  });

  it("links debt_owes_money to the debts page's iOwe tab with debtId", () => {
    const notification = makeNotification({
      type: "debt_owes_money",
      metadata: { participantId: "participant-1" }
    });
    expect(notificationTarget(notification)).toBe(
      "/debts?debtId=participant-1&tab=iOwe"
    );
  });

  it("links debt_owed_money to the debts page's owedToMe tab", () => {
    const notification = makeNotification({ type: "debt_owed_money", metadata: {} });
    expect(notificationTarget(notification)).toBe("/debts?tab=owedToMe");
  });

  it("links settlement_requested to the pending tab with settlementId and debtId", () => {
    const notification = makeNotification({
      type: "settlement_requested",
      metadata: { settlementRequestId: "sr-1", participantId: "participant-1" }
    });
    expect(notificationTarget(notification)).toBe(
      "/debts?debtId=participant-1&settlementId=sr-1&tab=pending"
    );
  });

  it("links settlement_approved/rejected to the debts page without forcing a tab", () => {
    const approved = makeNotification({
      type: "settlement_approved",
      metadata: { participantId: "participant-1" }
    });
    expect(notificationTarget(approved)).toBe("/debts?debtId=participant-1");

    const rejected = makeNotification({
      type: "settlement_rejected",
      metadata: { participantId: "participant-1" }
    });
    expect(notificationTarget(rejected)).toBe("/debts?debtId=participant-1");
  });

  it("links settlement_payment_registration_needed to the debts page with debtId", () => {
    const notification = makeNotification({
      type: "settlement_payment_registration_needed",
      metadata: { participantId: "participant-1" }
    });
    expect(notificationTarget(notification)).toBe("/debts?debtId=participant-1");
  });

  it("links shared_expense_added to the sharedExpenses tab with sharedExpenseId/participantId", () => {
    const notification = makeNotification({
      type: "shared_expense_added",
      metadata: { sharedExpenseId: "se-1", participantId: "participant-1" }
    });
    expect(notificationTarget(notification)).toBe(
      "/debts?tab=sharedExpenses&sharedExpenseId=se-1&participantId=participant-1"
    );
  });

  it("links provider_transactions_pending to the imported/pending transactions tab", () => {
    const notification = makeNotification({
      type: "provider_transactions_pending",
      metadata: {}
    });
    expect(notificationTarget(notification)).toBe(
      "/transactions?tab=imported&status=pending"
    );
  });

  it("links a generic transaction-metadata notification to the transaction detail route", () => {
    const notification = makeNotification({
      type: unhandledType,
      metadata: { transactionId: "tx-1" }
    });
    expect(notificationTarget(notification)).toBe("/transactions/tx-1");
  });

  it("falls back to debtorTransactionId, then creditorTransactionId, for the generic case", () => {
    const debtor = makeNotification({
      type: unhandledType,
      metadata: { debtorTransactionId: "tx-debtor" }
    });
    expect(notificationTarget(debtor)).toBe("/transactions/tx-debtor");

    const creditor = makeNotification({
      type: unhandledType,
      metadata: { creditorTransactionId: "tx-creditor" }
    });
    expect(notificationTarget(creditor)).toBe("/transactions/tx-creditor");
  });

  it("falls back to a groupId-scoped groups link for the generic case", () => {
    const notification = makeNotification({
      type: unhandledType,
      metadata: { groupId: "group-1" }
    });
    expect(notificationTarget(notification)).toBe("/groups?groupId=group-1");
  });

  it("returns null when there is no actionable target", () => {
    const notification = makeNotification({ type: unhandledType, metadata: {} });
    expect(notificationTarget(notification)).toBeNull();
  });

  it("returns null when metadata is entirely absent", () => {
    const notification = makeNotification({ type: unhandledType, metadata: undefined });
    expect(notificationTarget(notification)).toBeNull();
  });

  it("ignores a non-string/empty metadata value as if the key were absent", () => {
    const notification = makeNotification({
      type: unhandledType,
      metadata: { transactionId: 123, groupId: "" }
    });
    expect(notificationTarget(notification)).toBeNull();
  });
});
