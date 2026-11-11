import type { NotificationClient, NotificationInput } from "../types/notifications.types.js";

/** Bulk-inserts notifications within `tx`, silently dropping any with no `userId` (e.g. unregistered shared-expense participants) and any whose recipient has blocked its `senderUserId`. */
export async function createNotifications(
  tx: NotificationClient,
  notifications: NotificationInput[]
) {
  const senderIds = [...new Set(notifications.flatMap((n) => (n.senderUserId ? [n.senderUserId] : [])))];
  const blocks =
    senderIds.length > 0
      ? await tx.userBlock.findMany({
          where: { blockedId: { in: senderIds } },
          select: { blockerId: true, blockedId: true }
        })
      : [];
  const isSuppressed = (n: NotificationInput) =>
    Boolean(n.senderUserId) &&
    blocks.some((block) => block.blockerId === n.userId && block.blockedId === n.senderUserId);

  const data = notifications
    .filter((notification) => !isSuppressed(notification))
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
