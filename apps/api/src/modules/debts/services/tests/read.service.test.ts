import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../../currencies/services/read.service.js", () => ({
  getExchangeRate: vi.fn()
}));

const { getExchangeRate } = await import("../../../currencies/services/read.service.js");
const getExchangeRateMock = vi.mocked(getExchangeRate);

const { listDebts } = await import("../read.service.js");

const owner = { id: "owner-1", name: "Owner", email: "owner@example.com" };
const participant = { id: "participant-1", name: "Friend", email: "friend@example.com" };

function debtRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "debt-1",
    userId: participant.id,
    participantName: participant.name,
    shareAmount: { toNumber: () => 100 },
    paidAmount: { toNumber: () => 0 },
    currency: "USD",
    sharedExpense: {
      ownerUserId: owner.id,
      owner,
      transaction: { type: "expense" as const }
    },
    user: participant,
    settlementRequests: [],
    ...overrides
  };
}

function setupBaseMocks() {
  prismaMock.user.findUniqueOrThrow.mockResolvedValue({
    preferredCurrency: null
  } as never);
  prismaMock.sharedExpenseParticipant.findMany.mockResolvedValue([]);
  prismaMock.settlementRequest.findMany.mockResolvedValue([]);
}

describe("listDebts", () => {
  it("returns an empty shape when the user has no debts", async () => {
    setupBaseMocks();

    const result = await listDebts("owner-1");

    expect(result).toMatchObject({ iOwe: [], owedToMe: [], settledDebts: [] });
  });

  it("classifies an expense debt as owedToMe for the owner (creditor)", async () => {
    setupBaseMocks();
    prismaMock.sharedExpenseParticipant.findMany.mockResolvedValue([
      debtRow()
    ] as never);

    const result = await listDebts("owner-1");

    expect(result.owedToMe).toHaveLength(1);
    expect(result.iOwe).toHaveLength(0);
  });

  it("classifies the same expense debt as iOwe for the participant (debtor)", async () => {
    setupBaseMocks();
    prismaMock.sharedExpenseParticipant.findMany.mockResolvedValue([
      debtRow()
    ] as never);

    const result = await listDebts("participant-1");

    expect(result.iOwe).toHaveLength(1);
    expect(result.owedToMe).toHaveLength(0);
  });

  it("moves a fully-paid debt into settledDebts", async () => {
    setupBaseMocks();
    prismaMock.sharedExpenseParticipant.findMany.mockResolvedValue([
      debtRow({
        shareAmount: { toNumber: () => 100 },
        paidAmount: { toNumber: () => 100 }
      })
    ] as never);

    const result = await listDebts("owner-1");

    expect(result.settledDebts).toHaveLength(1);
    expect(result.owedToMe).toHaveLength(0);
  });

  it("excludes a debt unrelated to the viewer (transfer, no direction)", async () => {
    setupBaseMocks();
    prismaMock.sharedExpenseParticipant.findMany.mockResolvedValue([
      debtRow({
        sharedExpense: {
          ownerUserId: owner.id,
          owner,
          transaction: { type: "transfer" as const }
        }
      })
    ] as never);

    const result = await listDebts("owner-1");

    expect(result.iOwe).toHaveLength(0);
    expect(result.owedToMe).toHaveLength(0);
    expect(result.settledDebts).toHaveLength(0);
  });

  it("converts outstanding amounts to the user's preferred currency", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: "MXN"
    } as never);
    prismaMock.sharedExpenseParticipant.findMany.mockResolvedValue([
      debtRow({ currency: "USD" })
    ] as never);
    prismaMock.settlementRequest.findMany.mockResolvedValue([]);
    getExchangeRateMock.mockResolvedValue(17);

    const result = await listDebts("owner-1");

    expect(getExchangeRateMock).toHaveBeenCalledWith("USD", "MXN");
    expect(result.owedToMe[0]).toMatchObject({
      outstandingAmountInPreferredCurrency: 1700
    });
  });

  it("builds per-person balances from the classified debts", async () => {
    setupBaseMocks();
    prismaMock.sharedExpenseParticipant.findMany.mockResolvedValue([
      debtRow()
    ] as never);

    const result = await listDebts("owner-1");

    expect(result.balances).toHaveLength(1);
    expect(result.balances[0]).toMatchObject({ key: participant.id });
  });
});
