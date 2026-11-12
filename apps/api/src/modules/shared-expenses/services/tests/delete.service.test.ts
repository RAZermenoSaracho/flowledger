import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../../transactions/utils/sharedTransactionCleanup.js", () => ({
  deleteSharedTransactionData: vi.fn()
}));

const { deleteSharedTransactionData } = await import("../../../transactions/utils/sharedTransactionCleanup.js");
const { deleteSharedExpense } = await import("../delete.service.js");

const D = (value: number) => ({ toNumber: () => value });
const participant = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  participantName: "@friend",
  paidAmount: D(0),
  settlementRequests: [],
  ...overrides
});

describe("deleteSharedExpense", () => {
  it("throws a 404 when not owned by the user", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue(null);

    await expect(deleteSharedExpense("user-1", "se-1")).rejects.toThrow("Shared expense not found");
    expect(prismaMock.sharedExpense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "se-1", ownerUserId: "user-1" } })
    );
  });

  it("deletes the shared expense and its notifications when nothing was paid", async () => {
    const existing = { id: "se-1", participants: [participant()] };
    prismaMock.sharedExpense.findFirst.mockResolvedValue(existing as never);

    await deleteSharedExpense("user-1", "se-1");

    expect(deleteSharedTransactionData).toHaveBeenCalledWith(expect.anything(), existing);
  });

  it.each([
    ["a payment", { paidAmount: D(5) }],
    ["a pending settlement", { settlementRequests: [{ status: "pending", amount: D(5) }] }],
    ["an approved settlement", { settlementRequests: [{ status: "approved", amount: D(5) }] }]
  ])("is blocked with 400 by %s", async (_label, overrides) => {
    vi.mocked(deleteSharedTransactionData).mockClear();
    prismaMock.sharedExpense.findFirst.mockResolvedValue({ id: "se-1", participants: [participant(overrides)] } as never);

    await expect(deleteSharedExpense("user-1", "se-1")).rejects.toMatchObject({ statusCode: 400 });
    expect(deleteSharedTransactionData).not.toHaveBeenCalled();
  });
});
