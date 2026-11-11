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

/**
 * Like {@link createNotifications}, but keeps at most one unread notification per recipient, shared expense and type:
 * an unread one of the same key is deleted first, and within the batch the last wins. Notifications without
 * `metadata.sharedExpenseId` are created as-is.
 */
export async function createDedupedNotifications(tx: NotificationClient, notifications: NotificationInput[]) {
  const sharedExpenseIdOf = (n: NotificationInput) => {
    const id = (n.metadata as { sharedExpenseId?: unknown } | undefined)?.sharedExpenseId;
    return typeof id === "string" ? id : null;
  };
  const latest = new Map<string, NotificationInput>();
  const plain: NotificationInput[] = [];
  for (const n of notifications) {
    const sharedExpenseId = sharedExpenseIdOf(n);
    if (!sharedExpenseId || !n.userId) plain.push(n);
    else latest.set(`${n.userId}|${n.type}|${sharedExpenseId}`, n);
  }
  const deduped = [...latest.values()];

  for (const n of deduped) {
    await tx.notification.deleteMany({
      where: {
        userId: n.userId!,
        type: n.type,
        readAt: null,
        metadata: { path: ["sharedExpenseId"], equals: sharedExpenseIdOf(n)! }
      }
    });
  }
  await createNotifications(tx, [...plain, ...deduped]);
}
