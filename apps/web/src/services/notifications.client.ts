import { apiRequest } from "./api.client";
import type { Notification } from "../types/notifications.types";

/** Fetches the user's notifications. */
export function listNotifications() {
  return apiRequest<{ notifications: Notification[] }>("/notifications");
}

/** Fetches the user's unread notification count. */
export function getUnreadCount() {
  return apiRequest<{ count: number }>("/notifications/unread-count");
}

/** Marks all of the user's notifications read. */
export function markAllNotificationsRead() {
  return apiRequest<void>("/notifications/read-all", { method: "PATCH" });
}

/** Marks one notification read. */
export function markNotificationRead(notificationId: string) {
  return apiRequest<{ notification: Notification }>(
    `/notifications/${notificationId}/read`,
    { method: "PATCH" }
  );
}
