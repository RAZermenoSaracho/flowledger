import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { deleteTransaction } from "../delete.service.js";

describe("deleteTransaction", () => {
  it("throws a 404 when not owned by the user", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue(null);

    await expect(deleteTransaction("user-1", "txn-1")).rejects.toThrow(
      "Transaction not found"
    );
  });

  it("deletes a plain transaction with no shared expense", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({
      id: "txn-1",
      sharedExpense: null
    } as never);
    const tx = {
      notification: { deleteMany: vi.fn() },
      transaction: { delete: vi.fn() }
    };
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await deleteTransaction("user-1", "txn-1");

    expect(tx.transaction.delete).toHaveBeenCalledWith({ where: { id: "txn-1" } });
    const deleteManyArgs = tx.notification.deleteMany.mock.calls[0]?.[0] as {
      where: { OR: unknown[] };
    };
    expect(deleteManyArgs.where.OR).toHaveLength(1);
  });

  it("also cleans up notifications for the linked shared expense, participants, and settlement requests", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({
      id: "txn-1",
      sharedExpense: {
        id: "se-1",
        participants: [
          { id: "p1", settlementRequests: [{ id: "sr-1" }] },
          { id: "p2", settlementRequests: [] }
        ]
      }
    } as never);
    const tx = {
      notification: { deleteMany: vi.fn() },
      transaction: { delete: vi.fn() }
    };
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await deleteTransaction("user-1", "txn-1");

    const deleteManyArgs = tx.notification.deleteMany.mock.calls[0]?.[0] as {
      where: { OR: unknown[] };
    };
    // transactionId + sharedExpenseId + 2 participants + 1 settlement request
    expect(deleteManyArgs.where.OR).toHaveLength(5);
  });
});
