import { apiRequest } from "./api.client";
import type { Notification } from "../types/notifications.types";

export function listNotifications() {
  return apiRequest<{ notifications: Notification[] }>("/notifications");
}

export function getUnreadCount() {
  return apiRequest<{ count: number }>("/notifications/unread-count");
}

export function markAllNotificationsRead() {
  return apiRequest<void>("/notifications/read-all", { method: "PATCH" });
}

export function markNotificationRead(notificationId: string) {
  return apiRequest<{ notification: Notification }>(
    `/notifications/${notificationId}/read`,
    { method: "PATCH" }
  );
}
