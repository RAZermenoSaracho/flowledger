import { prisma } from "../../../db/prisma.js";

/** Fetches a user's 50 most recent notifications, newest first. */
export async function listNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50
  });
}

/** Counts a user's notifications that have not yet been read. */
export async function countUnreadNotifications(userId: string) {
  return prisma.notification.count({
    where: { userId, readAt: null }
  });
}
