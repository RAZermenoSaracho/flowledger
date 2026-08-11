import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../../groups/services/read.service.js", () => ({
  assertCategory: vi.fn(),
  getGroupMembership: vi.fn()
}));

const { assertCategory, getGroupMembership } = await import(
  "../../../groups/services/read.service.js"
);
const assertCategoryMock = vi.mocked(assertCategory);
const getGroupMembershipMock = vi.mocked(getGroupMembership);

const {
  assertExpenseOffsetAllowed,
  assertGroupRelations,
  assertOwnedRelations,
  assertTransferAllowed
} = await import("../transactionValidation.service.js");

describe("assertOwnedRelations", () => {
  it("does not throw when no relation fields are given", async () => {
    await expect(assertOwnedRelations("user-1", {})).resolves.toBeUndefined();
  });

  it("throws when accountId doesn't resolve to an active owned account", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);

    await expect(
      assertOwnedRelations("user-1", { accountId: "acc-1" })
    ).rejects.toThrow("Account does not exist or is archived");
  });

  it("throws when transferToAccountId doesn't resolve", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);

    await expect(
      assertOwnedRelations("user-1", { transferToAccountId: "acc-2" })
    ).rejects.toThrow("Destination account does not exist or is archived");
  });

  it("throws when a personal categoryId doesn't resolve", async () => {
    prismaMock.category.findFirst.mockResolvedValue(null);

    await expect(
      assertOwnedRelations("user-1", { categoryId: "cat-1" })
    ).rejects.toThrow("Category does not exist or is archived");
  });

  it("skips personal category validation when groupId is set", async () => {
    await assertOwnedRelations("user-1", { categoryId: "cat-1", groupId: "group-1" });
    expect(prismaMock.category.findFirst).not.toHaveBeenCalled();
  });

  it("throws when expenseOffsetCategoryId doesn't resolve", async () => {
    prismaMock.category.findFirst.mockResolvedValue(null);

    await expect(
      assertOwnedRelations("user-1", { expenseOffsetCategoryId: "cat-2" })
    ).rejects.toThrow("Expense offset category does not exist or is archived");
  });
});

describe("assertGroupRelations", () => {
  it("does nothing when no groupId is given", async () => {
    await assertGroupRelations("user-1", {});
    expect(getGroupMembershipMock).not.toHaveBeenCalled();
  });

  it("throws when the group doesn't exist or is archived", async () => {
    getGroupMembershipMock.mockResolvedValue({} as never);
    prismaMock.group.findFirst.mockResolvedValue(null);

    await expect(
      assertGroupRelations("user-1", { groupId: "group-1" })
    ).rejects.toThrow("Group does not exist or is archived");
  });

  it("delegates category validation to assertCategory", async () => {
    getGroupMembershipMock.mockResolvedValue({} as never);
    prismaMock.group.findFirst.mockResolvedValue({ id: "group-1" } as never);
    assertCategoryMock.mockResolvedValue(null);

    await assertGroupRelations("user-1", { groupId: "group-1", categoryId: "cat-1" });

    expect(assertCategoryMock).toHaveBeenCalledWith("user-1", "group-1", "cat-1");
  });

  it("throws when the group expense-offset category doesn't resolve", async () => {
    getGroupMembershipMock.mockResolvedValue({} as never);
    prismaMock.group.findFirst.mockResolvedValue({ id: "group-1" } as never);
    assertCategoryMock.mockResolvedValue(null);
    prismaMock.category.findFirst.mockResolvedValue(null);

    await expect(
      assertGroupRelations("user-1", {
        groupId: "group-1",
        expenseOffsetCategoryId: "cat-2"
      })
    ).rejects.toThrow("Expense offset category does not exist or is archived");
  });
});

describe("assertExpenseOffsetAllowed", () => {
  it("does not throw for an income transaction with an offset category", () => {
    expect(() =>
      assertExpenseOffsetAllowed({ type: "income", expenseOffsetCategoryId: "cat-1" })
    ).not.toThrow();
  });

  it("throws for a non-income transaction with an offset category", () => {
    expect(() =>
      assertExpenseOffsetAllowed({ type: "expense", expenseOffsetCategoryId: "cat-1" })
    ).toThrow("Expense offsets are only supported for income");
  });
});

describe("assertTransferAllowed", () => {
  const validTransfer = {
    type: "transfer" as const,
    accountId: "acc-1",
    transferToAccountId: "acc-2"
  };

  it("does not throw for a valid transfer", () => {
    expect(() => assertTransferAllowed(validTransfer)).not.toThrow();
  });

  it("throws when the from account is missing", () => {
    expect(() =>
      assertTransferAllowed({ ...validTransfer, accountId: null })
    ).toThrow("From account is required for transfers");
  });

  it("throws when the to account is missing", () => {
    expect(() =>
      assertTransferAllowed({ ...validTransfer, transferToAccountId: null })
    ).toThrow("To account is required for transfers");
  });

  it("throws when source and destination accounts are the same", () => {
    expect(() =>
      assertTransferAllowed({ ...validTransfer, transferToAccountId: "acc-1" })
    ).toThrow("Source and destination accounts must be different");
  });

  it("throws when a transfer carries a category", () => {
    expect(() =>
      assertTransferAllowed({ ...validTransfer, categoryId: "cat-1" })
    ).toThrow("Transfers cannot have category, expense offset, or group fields");
  });

  it("throws when a transfer is marked as a shared expense", () => {
    expect(() =>
      assertTransferAllowed({ ...validTransfer, sharedExpense: {} })
    ).toThrow("Transfers cannot be shared transactions");
  });

  it("throws when a non-transfer sets transferToAccountId", () => {
    expect(() =>
      assertTransferAllowed({ type: "expense", transferToAccountId: "acc-2" })
    ).toThrow("Destination account is only supported for transfers");
  });

  it("does not throw for a plain expense with no transfer fields", () => {
    expect(() => assertTransferAllowed({ type: "expense" })).not.toThrow();
  });
});
