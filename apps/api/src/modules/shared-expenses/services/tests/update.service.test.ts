import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../read.service.js", () => ({
  getOwnedTransaction: vi.fn(),
  normalizeSharedExpenseParticipants: vi.fn()
}));

vi.mock("../create.service.js", () => ({
  notifySharedExpenseParticipants: vi.fn()
}));

const { getOwnedTransaction, normalizeSharedExpenseParticipants } = await import(
  "../read.service.js"
);
const { notifySharedExpenseParticipants } = await import("../create.service.js");
const getOwnedTransactionMock = vi.mocked(getOwnedTransaction);
const normalizeSharedExpenseParticipantsMock = vi.mocked(
  normalizeSharedExpenseParticipants
);
const notifySharedExpenseParticipantsMock = vi.mocked(
  notifySharedExpenseParticipants
);

const { updateSharedExpense } = await import("../update.service.js");

function existingSharedExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: "se-1",
    ownerUserId: "owner-1",
    totalAmount: { toNumber: () => 100 },
    transaction: { groupId: null, executionCurrency: "USD" },
    participants: [{ userId: "user-2" }],
    ...overrides
  };
}

function mockUpdatedTx(participants: unknown[] = []) {
  return {
    sharedExpense: {
      update: vi.fn().mockResolvedValue({
        id: "se-1",
        transaction: { type: "expense", groupId: null },
        participants
      })
    }
  };
}

describe("updateSharedExpense", () => {
  it("throws a 404 when not owned by the user", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue(null);

    await expect(
      updateSharedExpense("user-1", "se-1", {} as never)
    ).rejects.toThrow("Shared expense not found");
  });

  it("updates fields without touching participants when none are given", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue(
      existingSharedExpense() as never
    );
    getOwnedTransactionMock.mockResolvedValue(null);
    const tx = mockUpdatedTx();
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await updateSharedExpense("owner-1", "se-1", { title: "Renamed" } as never);

    expect(tx.sharedExpense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ participants: expect.anything() })
      })
    );
    expect(notifySharedExpenseParticipantsMock).not.toHaveBeenCalled();
  });

  it("replaces participants and notifies only the newly added ones", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue(
      existingSharedExpense() as never
    );
    getOwnedTransactionMock.mockResolvedValue(null);
    normalizeSharedExpenseParticipantsMock.mockResolvedValue([
      { userId: "user-2", participantName: "Existing", shareAmount: 30, paidAmount: 0, status: "pending" },
      { userId: "user-3", participantName: "New Friend", shareAmount: 20, paidAmount: 0, status: "pending" }
    ] as never);
    const tx = mockUpdatedTx([
      { userId: "user-2" },
      { userId: "user-3" }
    ]);
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await updateSharedExpense("owner-1", "se-1", {
      participants: [
        { userId: "user-2", participantName: "Existing", shareAmount: 30 },
        { userId: "user-3", participantName: "New Friend", shareAmount: 20 }
      ]
    } as never);

    expect(tx.sharedExpense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          participants: expect.objectContaining({ deleteMany: {} })
        })
      })
    );
    const notifiedParticipants = notifySharedExpenseParticipantsMock.mock.calls[0]?.[3];
    expect(notifiedParticipants).toEqual([{ userId: "user-3" }]);
  });

  it("does not notify when the participant set changes but nobody new was added", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue(
      existingSharedExpense() as never
    );
    getOwnedTransactionMock.mockResolvedValue(null);
    normalizeSharedExpenseParticipantsMock.mockResolvedValue([
      { userId: "user-2", participantName: "Existing", shareAmount: 100, paidAmount: 0, status: "pending" }
    ] as never);
    const tx = mockUpdatedTx([{ userId: "user-2" }]);
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await updateSharedExpense("owner-1", "se-1", {
      participants: [{ userId: "user-2", participantName: "Existing", shareAmount: 100 }]
    } as never);

    expect(notifySharedExpenseParticipantsMock).not.toHaveBeenCalled();
  });
});
