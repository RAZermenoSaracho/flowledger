import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { deleteTransaction } from "../delete.service.js";

/** Runs `$transaction` callbacks against a tx whose `transaction.findFirst` resolves to `found`. */
function mockTx(found: unknown) {
  const tx = {
    notification: { deleteMany: vi.fn() },
    transaction: { findFirst: vi.fn().mockResolvedValue(found), delete: vi.fn() }
  };
  (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
  );
  return tx;
}

describe("deleteTransaction", () => {
  it("throws a 404 when not owned by the user", async () => {
    const tx = mockTx(null);

    await expect(deleteTransaction("user-1", "txn-1")).rejects.toThrow("Transaction not found");
    expect(tx.transaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "txn-1", userId: "user-1" } })
    );
    expect(tx.transaction.delete).not.toHaveBeenCalled();
  });

  it("deletes a plain transaction with no shared expense", async () => {
    const tx = mockTx({ id: "txn-1", sharedExpense: null });

    await deleteTransaction("user-1", "txn-1");

    expect(tx.transaction.delete).toHaveBeenCalledWith({ where: { id: "txn-1" } });
    const deleteManyArgs = tx.notification.deleteMany.mock.calls[0]?.[0] as { where: { OR: unknown[] } };
    expect(deleteManyArgs.where.OR).toHaveLength(1);
  });

  it("also cleans up notifications for the linked shared expense, participants, and settlement requests", async () => {
    const tx = mockTx({
      id: "txn-1",
      sharedExpense: {
        id: "se-1",
        participants: [
          { id: "p1", participantName: "@a", paidAmount: { toNumber: () => 0 }, settlementRequests: [{ id: "sr-1", status: "rejected", amount: { toNumber: () => 1 } }] },
          { id: "p2", participantName: "@b", paidAmount: { toNumber: () => 0 }, settlementRequests: [] }
        ]
      }
    });

    await deleteTransaction("user-1", "txn-1");

    const deleteManyArgs = tx.notification.deleteMany.mock.calls[0]?.[0] as { where: { OR: unknown[] } };
    // transactionId + sharedExpenseId + 2 participants + 1 settlement request
    expect(deleteManyArgs.where.OR).toHaveLength(5);
  });

  it.each([
    ["a payment", { paidAmount: { toNumber: () => 5 }, settlementRequests: [] }],
    ["a pending settlement", { paidAmount: { toNumber: () => 0 }, settlementRequests: [{ status: "pending", amount: { toNumber: () => 5 } }] }],
    ["an approved settlement", { paidAmount: { toNumber: () => 0 }, settlementRequests: [{ status: "approved", amount: { toNumber: () => 5 } }] }]
  ])("is blocked with 400 by %s, checked on rows reloaded inside the transaction, and deletes nothing", async (_label, overrides) => {
    const tx = mockTx({
      id: "txn-1",
      sharedExpense: { id: "se-1", participants: [{ id: "p1", participantName: "@friend", ...overrides }] }
    });

    await expect(deleteTransaction("user-1", "txn-1")).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.transaction.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.transaction.findFirst).not.toHaveBeenCalled();
    expect(tx.transaction.delete).not.toHaveBeenCalled();
  });
});
