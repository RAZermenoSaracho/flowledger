import { describe, expect, it, vi } from "vitest";
import { deleteSharedTransactionData } from "../sharedTransactionCleanup.js";

function mockTx() {
  return {
    notification: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    sharedExpense: { delete: vi.fn().mockResolvedValue({}) }
  };
}

describe("deleteSharedTransactionData", () => {
  it("does nothing when sharedExpense is null", async () => {
    const tx = mockTx();
    await deleteSharedTransactionData(tx as never, null);

    expect(tx.notification.deleteMany).not.toHaveBeenCalled();
    expect(tx.sharedExpense.delete).not.toHaveBeenCalled();
  });

  it("does nothing when sharedExpense is undefined", async () => {
    const tx = mockTx();
    await deleteSharedTransactionData(tx as never, undefined);

    expect(tx.notification.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes notifications referencing the shared expense, its participants, and their settlement requests, then deletes the shared expense", async () => {
    const tx = mockTx();
    const sharedExpense = {
      id: "se-1",
      participants: [
        { id: "participant-1", settlementRequests: [{ id: "sr-1" }] },
        { id: "participant-2", settlementRequests: [] }
      ]
    };

    await deleteSharedTransactionData(tx as never, sharedExpense);

    expect(tx.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { metadata: { path: ["sharedExpenseId"], equals: "se-1" } },
          { metadata: { path: ["participantId"], equals: "participant-1" } },
          { metadata: { path: ["participantId"], equals: "participant-2" } },
          { metadata: { path: ["settlementRequestId"], equals: "sr-1" } }
        ]
      }
    });
    expect(tx.sharedExpense.delete).toHaveBeenCalledWith({
      where: { id: "se-1" }
    });
  });

  it("still deletes the shared expense when it has no participants", async () => {
    const tx = mockTx();
    await deleteSharedTransactionData(tx as never, {
      id: "se-2",
      participants: []
    });

    expect(tx.sharedExpense.delete).toHaveBeenCalledWith({
      where: { id: "se-2" }
    });
  });
});
