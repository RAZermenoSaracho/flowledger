import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import {
  assertSettlementAccount,
  assertSettlementCategory,
  resolveSettlementExpenseOffsetCategoryId
} from "../settlementValidation.service.js";

describe("assertSettlementAccount", () => {
  it("returns the account when active and owned by the user", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1" } as never);

    expect(
      await assertSettlementAccount(prismaMock, "user-1", "acc-1")
    ).toMatchObject({ id: "acc-1" });
  });

  it("throws a 400 when the account doesn't exist or is archived", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);

    await expect(
      assertSettlementAccount(prismaMock, "user-1", "missing")
    ).rejects.toThrow("Account does not exist or is archived");
  });
});

describe("assertSettlementCategory", () => {
  it("resolves a personal category (groupId null)", async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: "cat-1" } as never);

    await assertSettlementCategory(prismaMock, "user-1", "cat-1", "expense");

    expect(prismaMock.category.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ groupId: null })
      })
    );
  });

  it("resolves a group category when groupId is given", async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: "cat-1" } as never);

    await assertSettlementCategory(
      prismaMock,
      "user-1",
      "cat-1",
      "income",
      "group-1"
    );

    expect(prismaMock.category.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ groupId: "group-1" })
      })
    );
  });

  it("throws a 400 when the category doesn't exist or is archived", async () => {
    prismaMock.category.findFirst.mockResolvedValue(null);

    await expect(
      assertSettlementCategory(prismaMock, "user-1", "missing", "expense")
    ).rejects.toThrow("Category does not exist or is archived");
  });
});

describe("resolveSettlementExpenseOffsetCategoryId", () => {
  it("uses the explicitly requested category when given", async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: "cat-req" } as never);

    const result = await resolveSettlementExpenseOffsetCategoryId(prismaMock, {
      userId: "user-1",
      requestedCategoryId: "cat-req",
      defaultCategoryId: "cat-default"
    });

    expect(result).toBe("cat-req");
  });

  it("throws a 400 when the requested category is invalid", async () => {
    prismaMock.category.findFirst.mockResolvedValue(null);

    await expect(
      resolveSettlementExpenseOffsetCategoryId(prismaMock, {
        userId: "user-1",
        requestedCategoryId: "invalid"
      })
    ).rejects.toThrow("Expense offset category does not exist or is archived");
  });

  it("clears the category when the caller explicitly requests null", async () => {
    const result = await resolveSettlementExpenseOffsetCategoryId(prismaMock, {
      userId: "user-1",
      requestedCategoryId: null,
      defaultCategoryId: "cat-default"
    });

    expect(result).toBeNull();
    expect(prismaMock.category.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to defaultCategoryId when the caller supplies nothing", async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: "cat-default" } as never);

    const result = await resolveSettlementExpenseOffsetCategoryId(prismaMock, {
      userId: "user-1",
      defaultCategoryId: "cat-default"
    });

    expect(result).toBe("cat-default");
  });

  it("returns null when there's no default category either", async () => {
    prismaMock.category.findFirst.mockResolvedValue(null);

    const result = await resolveSettlementExpenseOffsetCategoryId(prismaMock, {
      userId: "user-1"
    });

    expect(result).toBeNull();
  });
});
