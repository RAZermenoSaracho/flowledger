import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";

export async function assertSettlementAccount(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string,
  accountId: string
) {
  const account = await client.account.findFirst({
    where: { id: accountId, userId, isArchived: false }
  });
  if (!account) {
    throw new HttpError(400, "Account does not exist or is archived");
  }
  return account;
}

export async function assertSettlementCategory(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string,
  categoryId: string,
  type: "income" | "expense",
  groupId?: string | null
) {
  if (groupId) {
    const category = await client.category.findFirst({
      where: {
        id: categoryId,
        type,
        groupId,
        isArchived: false,
        users: { some: { userId } }
      }
    });
    if (!category) {
      throw new HttpError(400, "Category does not exist or is archived");
    }
    return;
  }

  const category = await client.category.findFirst({
    where: {
      id: categoryId,
      type,
      groupId: null,
      isArchived: false,
      users: { some: { userId } }
    }
  });
  if (!category) {
    throw new HttpError(400, "Category does not exist or is archived");
  }
}

async function findSettlementExpenseOffsetCategory(
  tx: Prisma.TransactionClient,
  userId: string,
  categoryId?: string | null,
  groupId?: string | null
) {
  if (!categoryId) return null;

  return tx.category.findFirst({
    where: {
      id: categoryId,
      type: "expense",
      groupId: groupId ?? null,
      isArchived: false,
      users: { some: { userId } },
      ...(groupId ? { group: { isArchived: false } } : {})
    }
  });
}

export async function resolveSettlementExpenseOffsetCategoryId(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    requestedCategoryId?: string | null;
    defaultCategoryId?: string | null;
    groupId?: string | null;
  }
) {
  if (input.requestedCategoryId !== undefined) {
    const category = await findSettlementExpenseOffsetCategory(
      tx,
      input.userId,
      input.requestedCategoryId,
      input.groupId
    );
    if (input.requestedCategoryId && !category) {
      throw new HttpError(
        400,
        "Expense offset category does not exist or is archived"
      );
    }
    return category?.id ?? null;
  }

  const category = await findSettlementExpenseOffsetCategory(
    tx,
    input.userId,
    input.defaultCategoryId,
    input.groupId
  );
  return category?.id ?? null;
}
