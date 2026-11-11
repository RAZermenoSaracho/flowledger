import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../apply.service.js", () => ({
  applySharedExpenseToTransaction: vi.fn()
}));

vi.mock("../read.service.js", () => ({
  getSharedExpenseById: vi.fn()
}));

vi.mock("../../../notifications/services/create.service.js", () => ({
  createDedupedNotifications: vi.fn()
}));

const { applySharedExpenseToTransaction } = await import("../apply.service.js");
const { getSharedExpenseById } = await import("../read.service.js");
const { createDedupedNotifications } = await import("../../../notifications/services/create.service.js");
const applyMock = vi.mocked(applySharedExpenseToTransaction);
const getByIdMock = vi.mocked(getSharedExpenseById);
const notifyMock = vi.mocked(createDedupedNotifications);

const { respondToSharedExpense, updateSharedExpense } = await import("../update.service.js");

const transaction = { id: "txn-1", type: "expense", groupId: null, executionCurrency: "USD" };
const existing = { id: "se-1", transactionId: "txn-1", status: "open", ownerUserId: "owner-1", transaction };

describe("updateSharedExpense", () => {
  it("throws a 404 when not owned by the user", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue(null);

    await expect(updateSharedExpense("user-1", "se-1", {} as never)).rejects.toThrow("Shared expense not found");
    expect(prismaMock.sharedExpense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "se-1", ownerUserId: "user-1" } })
    );
  });

  it("rejects moving the shared expense to another transaction", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue(existing as never);

    await expect(
      updateSharedExpense("owner-1", "se-1", { transactionId: "txn-2" } as never)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("leaves participants untouched when none are given", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue(existing as never);
    applyMock.mockResolvedValue({ id: "se-1" } as never);

    await updateSharedExpense("owner-1", "se-1", { title: "Renamed" } as never);

    expect(applyMock).toHaveBeenCalledWith(expect.anything(), "owner-1", transaction, "expense", {
      enabled: true,
      title: "Renamed",
      participants: undefined
    });
  });

  it("maps legacy participants to the diffing shape and ignores client payment fields", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue(existing as never);
    applyMock.mockResolvedValue({ id: "se-1" } as never);

    await updateSharedExpense("owner-1", "se-1", {
      participants: [{ userId: "user-2", participantName: "x", shareAmount: 30, paidAmount: 30, status: "paid" }]
    } as never);

    expect(applyMock.mock.calls[0]?.[4]).toEqual({
      enabled: true,
      title: undefined,
      participants: [{ userId: "user-2", share: 30 }]
    });
  });
});

describe("respondToSharedExpense", () => {
  const participantRow = (acceptance = "proposed") => ({
    id: "p1",
    acceptance,
    sharedExpenseId: "se-1",
    sharedExpense: { ownerUserId: "owner-1", title: "Dinner", transactionId: "txn-1" },
    user: { id: "user-2", username: "friend", name: "Friend", identityVisibility: "username_only" }
  });

  it("is scoped by sharedExpenseId and the caller, so the owner or a stranger gets 404", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(null);

    await expect(respondToSharedExpense("owner-1", "se-1", "accepted")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.sharedExpenseParticipant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sharedExpenseId: "se-1", userId: "owner-1" } })
    );
    expect(prismaMock.sharedExpenseParticipant.updateMany).not.toHaveBeenCalled();
  });

  it("accepts a proposed share and notifies the owner", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(participantRow() as never);
    prismaMock.sharedExpenseParticipant.updateMany.mockResolvedValue({ count: 1 });
    getByIdMock.mockResolvedValue({ id: "se-1" } as never);

    await respondToSharedExpense("user-2", "se-1", "accepted");

    expect(prismaMock.sharedExpenseParticipant.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", userId: "user-2", acceptance: "proposed" },
      data: { acceptance: "accepted" }
    });
    expect(notifyMock.mock.calls[0]?.[1]).toMatchObject([
      { userId: "owner-1", senderUserId: "user-2", type: "shared_expense_accepted" }
    ]);
  });

  it("rejects a proposed share and notifies the owner", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(participantRow() as never);
    prismaMock.sharedExpenseParticipant.updateMany.mockResolvedValue({ count: 1 });
    getByIdMock.mockResolvedValue({ id: "se-1" } as never);

    await respondToSharedExpense("user-2", "se-1", "rejected");

    expect(notifyMock.mock.calls.at(-1)?.[1]).toMatchObject([{ type: "shared_expense_rejected" }]);
  });

  it.each(["accepted", "rejected"])("returns 400 and changes nothing when the share is already %s", async (state) => {
    notifyMock.mockClear();
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(participantRow(state) as never);
    prismaMock.sharedExpenseParticipant.updateMany.mockResolvedValue({ count: 0 });

    await expect(respondToSharedExpense("user-2", "se-1", "accepted")).rejects.toMatchObject({ statusCode: 400 });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
