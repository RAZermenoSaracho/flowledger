import type { NotificationType, Prisma } from "@prisma/client";

export type NotificationInput = {
  userId: string | null | undefined;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
};

export type NotificationClient = Pick<Prisma.TransactionClient, "notification">;
