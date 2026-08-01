import { apiRequest } from "./api";
import type { Notification } from "../types/api";

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
