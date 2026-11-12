import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../apply.service.js", () => ({
  applySharedExpenseToTransaction: vi.fn()
}));

vi.mock("../read.service.js", () => ({
  getOwnedTransaction: vi.fn()
}));

const { applySharedExpenseToTransaction } = await import("../apply.service.js");
const { getOwnedTransaction } = await import("../read.service.js");
const applyMock = vi.mocked(applySharedExpenseToTransaction);
const getOwnedTransactionMock = vi.mocked(getOwnedTransaction);

const { createSharedExpense, createSharedExpenseForTransaction } = await import("../create.service.js");

const transactionRow = {
  id: "txn-1",
  amount: { toNumber: () => 100 },
  name: "Dinner",
  groupId: null,
  type: "expense" as const,
  executionCurrency: "USD"
};

describe("createSharedExpenseForTransaction", () => {
  it("throws a 400 for a transfer transaction", async () => {
    await expect(
      createSharedExpenseForTransaction(
        {} as never,
        "owner-1",
        { ...transactionRow, type: "transfer" } as never,
        { title: "x", status: "open", participants: [] } as never
      )
    ).rejects.toThrow("Shared transactions are only supported for income and expense transactions");
  });

  it("maps legacy participants to the sharing shape and drops payment fields", async () => {
    applyMock.mockResolvedValue({ id: "se-1" } as never);

    await createSharedExpenseForTransaction({} as never, "owner-1", transactionRow as never, {
      title: "Dinner split",
      status: "open",
      participants: [
        { userId: "user-2", participantName: "Stale", shareAmount: 50, paidAmount: 50, status: "paid" },
        { participantName: "Cash Friend", shareAmount: 10, paidAmount: 0, status: "pending" }
      ]
    });

    expect(applyMock).toHaveBeenCalledWith({}, "owner-1", transactionRow, "expense", {
      enabled: true,
      title: "Dinner split",
      participants: [
        { userId: "user-2", share: 50 },
        { manualName: "Cash Friend", share: 10 }
      ]
    });
  });
});

describe("createSharedExpense", () => {
  const input = { transactionId: "txn-1", title: "Dinner split", status: "open", participants: [] } as never;

  it("throws a 400 when the transaction doesn't resolve", async () => {
    getOwnedTransactionMock.mockResolvedValue(null);

    await expect(createSharedExpense("user-1", input)).rejects.toThrow("Transaction is required");
  });

  it("returns 409 when the transaction is already shared", async () => {
    getOwnedTransactionMock.mockResolvedValue(transactionRow as never);
    prismaMock.sharedExpense.findUnique.mockResolvedValue({ id: "se-1" } as never);

    await expect(createSharedExpense("user-1", input)).rejects.toMatchObject({
      statusCode: 409,
      message: "This transaction is already shared"
    });
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("creates the shared expense inside a transaction when none exists", async () => {
    getOwnedTransactionMock.mockResolvedValue(transactionRow as never);
    prismaMock.sharedExpense.findUnique.mockResolvedValue(null);
    applyMock.mockResolvedValue({ id: "se-1" } as never);

    expect(await createSharedExpense("user-1", input)).toMatchObject({ id: "se-1" });
  });
});
