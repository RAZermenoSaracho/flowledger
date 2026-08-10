import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import {
  assertCategory,
  getGroupMembership
} from "../../groups/services/read.service.js";

/** Throws if any of the given account/category relations don't belong to `userId` (or, for a group transaction, aren't valid group-scoped resources — see {@link assertGroupRelations}). */
export async function assertOwnedRelations(
  userId: string,
  input: {
    accountId?: string | null;
    transferToAccountId?: string | null;
    categoryId?: string | null;
    expenseOffsetCategoryId?: string | null;
    groupId?: string | null;
  }
) {
  if (input.accountId) {
    const account = await prisma.account.findFirst({
      where: { id: input.accountId, userId, isArchived: false }
    });
    if (!account)
      throw new HttpError(400, "Account does not exist or is archived");
  }

  if (input.transferToAccountId) {
    const account = await prisma.account.findFirst({
      where: { id: input.transferToAccountId, userId, isArchived: false }
    });
    if (!account) {
      throw new HttpError(
        400,
        "Destination account does not exist or is archived"
      );
    }
  }

  if (input.categoryId && !input.groupId) {
    const category = await prisma.category.findFirst({
      where: {
        id: input.categoryId,
        groupId: null,
        isArchived: false,
        users: { some: { userId } }
      }
    });
    if (!category)
      throw new HttpError(400, "Category does not exist or is archived");
  }

  if (input.expenseOffsetCategoryId && !input.groupId) {
    const category = await prisma.category.findFirst({
      where: {
        id: input.expenseOffsetCategoryId,
        type: "expense",
        groupId: null,
        isArchived: false,
        users: { some: { userId } }
      }
    });
    if (!category) {
      throw new HttpError(
        400,
        "Expense offset category does not exist or is archived"
      );
    }
  }
}

/** Throws if `groupId` (when set) isn't a group the user belongs to, or its category/expense-offset-category relations aren't valid for that group. */
export async function assertGroupRelations(
  userId: string,
  input: {
    groupId?: string | null;
    categoryId?: string | null;
    expenseOffsetCategoryId?: string | null;
  }
) {
  if (input.groupId) {
    await getGroupMembership(userId, input.groupId);
    const group = await prisma.group.findFirst({
      where: { id: input.groupId, isArchived: false }
    });
    if (!group) throw new HttpError(400, "Group does not exist or is archived");
  }

  if (input.groupId) {
    await assertCategory(userId, input.groupId, input.categoryId);

    if (input.expenseOffsetCategoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: input.expenseOffsetCategoryId,
          type: "expense",
          groupId: input.groupId,
          isArchived: false,
          users: { some: { userId } }
        }
      });
      if (!category) {
        throw new HttpError(
          400,
          "Expense offset category does not exist or is archived"
        );
      }
    }
  }
}

/** Throws if an expense-offset category is set on a non-income transaction. */
export function assertExpenseOffsetAllowed(input: {
  type?: "income" | "expense" | "transfer";
  expenseOffsetCategoryId?: string | null;
}) {
  if (input.expenseOffsetCategoryId && input.type !== "income") {
    throw new HttpError(400, "Expense offsets are only supported for income");
  }
}

/** Throws if a transfer is missing its from/to accounts, reuses the same account on both sides, carries category/group fields, or is marked as a shared expense. */
export function assertTransferAllowed(input: {
  type?: "income" | "expense" | "transfer";
  accountId?: string | null;
  transferToAccountId?: string | null;
  categoryId?: string | null;
  expenseOffsetCategoryId?: string | null;
  groupId?: string | null;
  sharedExpense?: unknown;
}) {
  if (input.type === "transfer") {
    if (!input.accountId) {
      throw new HttpError(400, "From account is required for transfers");
    }

    if (!input.transferToAccountId) {
      throw new HttpError(400, "To account is required for transfers");
    }

    if (input.accountId === input.transferToAccountId) {
      throw new HttpError(
        400,
        "Source and destination accounts must be different"
      );
    }

    if (input.categoryId || input.expenseOffsetCategoryId || input.groupId) {
      throw new HttpError(
        400,
        "Transfers cannot have category, expense offset, or group fields"
      );
    }

    if (input.sharedExpense) {
      throw new HttpError(400, "Transfers cannot be shared transactions");
    }
  }

  if (input.type !== "transfer" && input.transferToAccountId) {
    throw new HttpError(
      400,
      "Destination account is only supported for transfers"
    );
  }
}
