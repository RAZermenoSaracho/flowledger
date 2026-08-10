import type { NotificationType, Prisma } from "@prisma/client";

/** Row shape for a notification to be created; `userId` may be `null`/`undefined` for a not-yet-registered participant and is filtered out before insert. */
export type NotificationInput = {
  userId: string | null | undefined;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
};

/** Prisma transaction client narrowed to the `notification` delegate, so notification services can accept any transaction without importing the full client type. */
export type NotificationClient = Pick<Prisma.TransactionClient, "notification">;
