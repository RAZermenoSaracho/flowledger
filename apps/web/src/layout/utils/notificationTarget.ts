import { routes } from "../../constants/routes";
import type { Notification } from "../../types/notifications.types";

function metadataString(
  metadata: Notification["metadata"],
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value ? value : null;
}

/** Resolves the in-app route a notification should navigate to when opened, or `null` if it has no actionable target. */
export function notificationTarget(notification: Notification) {
  const metadata = notification.metadata;
  const params = new URLSearchParams();

  if (notification.type === "group_member_added") {
    const groupId = metadataString(metadata, "groupId");
    return groupId
      ? `${routes.groups}?groupId=${encodeURIComponent(groupId)}`
      : routes.groups;
  }

  if (
    notification.type === "debt_owes_money" ||
    notification.type === "debt_owed_money"
  ) {
    const participantId = metadataString(metadata, "participantId");
    if (participantId) params.set("debtId", participantId);
    params.set(
      "tab",
      notification.type === "debt_owes_money" ? "iOwe" : "owedToMe"
    );
    return `${routes.debts}?${params.toString()}`;
  }

  if (
    notification.type === "settlement_requested" ||
    notification.type === "settlement_approved" ||
    notification.type === "settlement_rejected" ||
    notification.type === "settlement_payment_registration_needed"
  ) {
    const settlementRequestId = metadataString(metadata, "settlementRequestId");
    const participantId = metadataString(metadata, "participantId");
    if (participantId) params.set("debtId", participantId);
    if (notification.type === "settlement_requested") {
      if (settlementRequestId) {
        params.set("settlementId", settlementRequestId);
      }
      params.set("tab", "pending");
    }
    return `${routes.debts}?${params.toString()}`;
  }

  if (notification.type === "shared_expense_added") {
    const sharedExpenseId = metadataString(metadata, "sharedExpenseId");
    const participantId = metadataString(metadata, "participantId");
    params.set("tab", "sharedExpenses");
    if (sharedExpenseId) params.set("sharedExpenseId", sharedExpenseId);
    if (participantId) params.set("participantId", participantId);
    return `${routes.debts}?${params.toString()}`;
  }

  if (notification.type === "provider_transactions_pending") {
    params.set("tab", "imported");
    params.set("status", "pending");
    return `${routes.transactions}?${params.toString()}`;
  }

  const transactionId =
    metadataString(metadata, "transactionId") ||
    metadataString(metadata, "debtorTransactionId") ||
    metadataString(metadata, "creditorTransactionId");
  if (transactionId) return `${routes.transactions}/${transactionId}`;

  const groupId = metadataString(metadata, "groupId");
  if (groupId) {
    return `${routes.groups}?groupId=${encodeURIComponent(groupId)}`;
  }

  return null;
}
