import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";

/** Throws if `categoryId` isn't a valid personal category (matching `type`, if given) for `userId`; returns `null` when no category was requested. */
export async function assertImportedTransactionCategory(input: {
  userId: string;
  categoryId: string | null | undefined;
  type?: "income" | "expense";
}) {
  if (!input.categoryId) return null;

  const category = await prisma.category.findFirst({
    where: {
      id: input.categoryId,
      groupId: null,
      isArchived: false,
      users: { some: { userId: input.userId } },
      ...(input.type ? { type: input.type } : {})
    }
  });

  if (!category) {
    throw new HttpError(
      400,
      "Category does not exist, is archived, or does not match the transaction type"
    );
  }

  return category;
}

/** Marks the user's "provider transactions pending" notifications read once no pending imported transactions remain. */
export async function clearProviderPendingNotifications(
  tx: Prisma.TransactionClient,
  userId: string
) {
  const pendingCount = await tx.providerImportedTransaction.count({
    where: { userId, status: "pending" }
  });

  if (pendingCount > 0) return;

  await tx.notification.updateMany({
    where: {
      userId,
      type: "provider_transactions_pending",
      readAt: null
    },
    data: { readAt: new Date() }
  });
}
