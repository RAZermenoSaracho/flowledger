import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import {
  assertImportedTransactionCategory,
  clearProviderPendingNotifications
} from "../importedTransactionValidation.service.js";

describe("assertImportedTransactionCategory", () => {
  it("returns null when no categoryId is given", async () => {
    expect(
      await assertImportedTransactionCategory({ userId: "user-1", categoryId: null })
    ).toBeNull();
  });

  it("throws a 400 when the category doesn't resolve", async () => {
    prismaMock.category.findFirst.mockResolvedValue(null);

    await expect(
      assertImportedTransactionCategory({ userId: "user-1", categoryId: "cat-1" })
    ).rejects.toThrow(
      "Category does not exist, is archived, or does not match the transaction type"
    );
  });

  it("scopes the lookup to the requested type when given", async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: "cat-1" } as never);

    await assertImportedTransactionCategory({
      userId: "user-1",
      categoryId: "cat-1",
      type: "expense"
    });

    expect(prismaMock.category.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "expense" })
      })
    );
  });

  it("returns the category when found", async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: "cat-1" } as never);

    expect(
      await assertImportedTransactionCategory({ userId: "user-1", categoryId: "cat-1" })
    ).toMatchObject({ id: "cat-1" });
  });
});

describe("clearProviderPendingNotifications", () => {
  it("does nothing while pending imported transactions remain", async () => {
    const tx = {
      providerImportedTransaction: { count: vi.fn().mockResolvedValue(2) },
      notification: { updateMany: vi.fn() }
    };

    await clearProviderPendingNotifications(tx as never, "user-1");

    expect(tx.notification.updateMany).not.toHaveBeenCalled();
  });

  it("marks the pending-review notification read once none remain", async () => {
    const tx = {
      providerImportedTransaction: { count: vi.fn().mockResolvedValue(0) },
      notification: { updateMany: vi.fn() }
    };

    await clearProviderPendingNotifications(tx as never, "user-1");

    expect(tx.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", type: "provider_transactions_pending", readAt: null },
      data: { readAt: expect.any(Date) }
    });
  });
});
