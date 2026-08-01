import type { NotificationClient, NotificationInput } from "../types/notifications.types.js";

export async function createNotifications(
  tx: NotificationClient,
  notifications: NotificationInput[]
) {
  const data = notifications
    .filter((notification): notification is NotificationInput & { userId: string } =>
      Boolean(notification.userId)
    )
    .map((notification) => ({
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata
    }));

  if (data.length === 0) return;

  await tx.notification.createMany({ data });
}
