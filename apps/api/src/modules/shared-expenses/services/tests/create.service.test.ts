import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../../notifications/services/create.service.js", () => ({
  createNotifications: vi.fn()
}));

vi.mock("../read.service.js", () => ({
  getOwnedTransaction: vi.fn(),
  normalizeSharedExpenseParticipants: vi.fn()
}));

const { createNotifications } = await import(
  "../../../notifications/services/create.service.js"
);
const { getOwnedTransaction, normalizeSharedExpenseParticipants } = await import(
  "../read.service.js"
);
const createNotificationsMock = vi.mocked(createNotifications);
const getOwnedTransactionMock = vi.mocked(getOwnedTransaction);
const normalizeSharedExpenseParticipantsMock = vi.mocked(
  normalizeSharedExpenseParticipants
);

const {
  createSharedExpense,
  createSharedExpenseForTransaction,
  notifySharedExpenseParticipants
} = await import("../create.service.js");

function mockTx() {
  return {
    sharedExpense: {
      create: vi.fn().mockResolvedValue({
        id: "se-1",
        title: "Dinner",
        transactionId: "txn-1",
        transaction: { type: "expense", groupId: null },
        participants: []
      })
    }
  };
}

describe("notifySharedExpenseParticipants", () => {
  it("skips participants with no userId (manual/unregistered)", async () => {
    const tx = {};
    await notifySharedExpenseParticipants(
      tx as never,
      "owner-1",
      { id: "se-1", title: "Dinner", transactionId: "txn-1", transaction: { type: "expense" } },
      [{ id: "p1", userId: null, participantName: "Cash Friend", shareAmount: { toNumber: () => 50 } as never }]
    );

    expect(createNotificationsMock).toHaveBeenCalledWith(tx, []);
  });

  it("only sends the 'added' notification for a transfer (no debt direction)", async () => {
    const tx = {};
    await notifySharedExpenseParticipants(
      tx as never,
      "owner-1",
      { id: "se-1", title: "Trip", transactionId: "txn-1", transaction: { type: "transfer" } },
      [{ id: "p1", userId: "user-2", participantName: "Friend", shareAmount: { toNumber: () => 50 } as never }]
    );

    const notifications = createNotificationsMock.mock.calls[0]?.[1];
    expect(notifications).toHaveLength(1);
    expect(notifications?.[0]).toMatchObject({ type: "shared_expense_added" });
  });

  it("sends added + debt-owes/owed notifications for an expense split", async () => {
    const tx = {};
    await notifySharedExpenseParticipants(
      tx as never,
      "owner-1",
      { id: "se-1", title: "Dinner", transactionId: "txn-1", transaction: { type: "expense" } },
      [{ id: "p1", userId: "user-2", participantName: "Friend", shareAmount: { toNumber: () => 50 } as never }]
    );

    const notifications = createNotificationsMock.mock.calls[0]?.[1];
    expect(notifications?.map((n) => n.type)).toEqual([
      "shared_expense_added",
      "debt_owes_money",
      "debt_owed_money"
    ]);
    expect(notifications?.[1]).toMatchObject({ userId: "user-2" });
    expect(notifications?.[2]).toMatchObject({ userId: "owner-1" });
  });
});

describe("createSharedExpenseForTransaction", () => {
  it("throws a 400 for a transfer transaction", async () => {
    const tx = mockTx();

    await expect(
      createSharedExpenseForTransaction(
        tx as never,
        "owner-1",
        { id: "txn-1", amount: 100 as never, name: "Move", groupId: null, type: "transfer", executionCurrency: "USD" },
        { title: "x", status: "open", participants: [] } as never
      )
    ).rejects.toThrow(
      "Shared transactions are only supported for income and expense transactions"
    );
  });

  it("creates the shared expense with participants and notifies them", async () => {
    const tx = mockTx();
    normalizeSharedExpenseParticipantsMock.mockResolvedValue([
      { userId: "user-2", participantName: "Friend", shareAmount: 50, paidAmount: 0, status: "pending" }
    ] as never);

    await createSharedExpenseForTransaction(
      tx as never,
      "owner-1",
      {
        id: "txn-1",
        amount: { toNumber: () => 100 } as never,
        name: "Dinner",
        groupId: null,
        type: "expense",
        executionCurrency: "USD"
      },
      { title: "Dinner split", status: "open", participants: [] } as never
    );

    expect(tx.sharedExpense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ transactionId: "txn-1", ownerUserId: "owner-1" })
      })
    );
    expect(createNotificationsMock).toHaveBeenCalled();
  });
});

describe("createSharedExpense", () => {
  it("throws a 400 when the transaction doesn't resolve", async () => {
    getOwnedTransactionMock.mockResolvedValue(null);

    await expect(
      createSharedExpense("user-1", { transactionId: "missing", title: "x", status: "open", participants: [] } as never)
    ).rejects.toThrow("Transaction is required");
  });

  it("creates the shared expense inside a transaction when the transaction resolves", async () => {
    getOwnedTransactionMock.mockResolvedValue({
      id: "txn-1",
      amount: { toNumber: () => 100 },
      name: "Dinner",
      groupId: null,
      type: "expense",
      executionCurrency: "USD"
    } as never);
    normalizeSharedExpenseParticipantsMock.mockResolvedValue([] as never);
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)(mockTx())
        : Promise.resolve(arg)
    );

    const result = await createSharedExpense("user-1", {
      transactionId: "txn-1",
      title: "Dinner split",
      status: "open",
      participants: []
    } as never);

    expect(result).toMatchObject({ id: "se-1" });
  });
});
