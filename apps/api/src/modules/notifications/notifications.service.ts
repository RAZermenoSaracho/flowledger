import type { NotificationType, Prisma } from "@prisma/client";

type NotificationInput = {
  userId: string | null | undefined;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
};

type NotificationClient = Pick<Prisma.TransactionClient, "notification">;

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

export function moneyText(amount: Prisma.Decimal | number) {
  const value = typeof amount === "number" ? amount : amount.toNumber();
  return `$${value.toFixed(2)}`;
}
