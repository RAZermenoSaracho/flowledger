import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() }
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, userId }
  });
  if (!existing) throw notFound("Notification");

  return prisma.notification.update({
    where: { id: existing.id },
    data: { readAt: existing.readAt ?? new Date() }
  });
}
