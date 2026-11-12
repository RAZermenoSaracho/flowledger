import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../settlementValidation.service.js", () => ({
  assertSettlementAccount: vi.fn(),
  assertSettlementCategory: vi.fn()
}));

vi.mock("../../../notifications/services/create.service.js", () => ({
  createNotifications: vi.fn()
}));

const { assertSettlementAccount, assertSettlementCategory } = await import(
  "../settlementValidation.service.js"
);
const { createNotifications } = await import(
  "../../../notifications/services/create.service.js"
);
const assertSettlementAccountMock = vi.mocked(assertSettlementAccount);
const assertSettlementCategoryMock = vi.mocked(assertSettlementCategory);
const createNotificationsMock = vi.mocked(createNotifications);

const { createBatchSettlementRequests, createSettlementRequest } = await import(
  "../create.service.js"
);

function debtRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "debt-1",
    userId: "user-1",
    currency: "USD",
    shareAmount: { toNumber: () => 100 },
    paidAmount: { toNumber: () => 0 },
    acceptance: "accepted",
    sharedExpense: {
      ownerUserId: "owner-1",
      title: "Dinner",
      transaction: { type: "expense" as const, groupId: null }
    },
    settlementRequests: [],
    ...overrides
  };
}

describe("createSettlementRequest", () => {
  it("throws a 404 when the debt doesn't exist", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(null);

    await expect(
      createSettlementRequest("user-1", "debt-1", {
        amount: "50",
        accountId: "acc-1",
        categoryId: "cat-1"
      })
    ).rejects.toThrow("Debt not found");
  });

  it.each(["proposed", "rejected"])("throws a 400 when the share is %s", async (acceptance) => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(
      debtRow({ acceptance }) as never
    );

    await expect(
      createSettlementRequest("user-1", "debt-1", { amount: "50", accountId: "acc-1", categoryId: "cat-1" })
    ).rejects.toThrow("This share has not been accepted");
  });

  it("throws a 404 when the caller isn't the debtor", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(
      debtRow() as never
    );

    await expect(
      createSettlementRequest("someone-else", "debt-1", {
        amount: "50",
        accountId: "acc-1",
        categoryId: "cat-1"
      })
    ).rejects.toThrow("Debt not found");
  });

  it("throws a 400 when the debt is already settled", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(
      debtRow({
        shareAmount: { toNumber: () => 100 },
        paidAmount: { toNumber: () => 100 }
      }) as never
    );
    assertSettlementAccountMock.mockResolvedValue({ currency: "USD" } as never);
    assertSettlementCategoryMock.mockResolvedValue(undefined as never);

    await expect(
      createSettlementRequest("user-1", "debt-1", {
        amount: "50",
        accountId: "acc-1",
        categoryId: "cat-1"
      })
    ).rejects.toThrow("Debt is already settled");
  });

  it("throws a 400 when the requested amount exceeds the outstanding balance minus pending", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(
      debtRow() as never
    );
    assertSettlementAccountMock.mockResolvedValue({ currency: "USD" } as never);
    assertSettlementCategoryMock.mockResolvedValue(undefined as never);

    await expect(
      createSettlementRequest("user-1", "debt-1", {
        amount: "150",
        accountId: "acc-1",
        categoryId: "cat-1"
      })
    ).rejects.toThrow("Settlement request exceeds the outstanding balance");
  });

  it("throws a 409 when a pending request already exists", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(
      debtRow() as never
    );
    assertSettlementAccountMock.mockResolvedValue({ currency: "USD" } as never);
    assertSettlementCategoryMock.mockResolvedValue(undefined as never);
    prismaMock.settlementRequest.findFirst.mockResolvedValue({
      id: "existing"
    } as never);

    await expect(
      createSettlementRequest("user-1", "debt-1", {
        amount: "50",
        accountId: "acc-1",
        categoryId: "cat-1"
      })
    ).rejects.toThrow("A pending settlement request already exists for this debt");
  });

  it("runs the checks and the insert in one Serializable transaction and maps P2034 to 409", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "x" })
    );

    await expect(
      createSettlementRequest("user-1", "debt-1", { amount: "50", accountId: "acc-1", categoryId: "cat-1" })
    ).rejects.toMatchObject({ statusCode: 409, message: "Please retry" });

    prismaMock.$transaction.mockClear();
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(null);
    await createSettlementRequest("user-1", "debt-1", { amount: "50", accountId: "acc-1", categoryId: "cat-1" }).catch(
      () => undefined
    );
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });
  });

  it("creates the request and notifies the creditor", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(
      debtRow() as never
    );
    assertSettlementAccountMock.mockResolvedValue({ currency: "USD" } as never);
    assertSettlementCategoryMock.mockResolvedValue(undefined as never);
    prismaMock.settlementRequest.findFirst.mockResolvedValue(null);
    prismaMock.settlementRequest.create.mockResolvedValue({
      id: "sr-1",
      creditorUserId: "owner-1",
      debtor: { name: "User One" },
      amount: { toNumber: () => 50 },
      sharedExpenseParticipantId: "debt-1",
      sharedExpenseParticipant: {
        sharedExpenseId: "se-1",
        sharedExpense: { title: "Dinner", transaction: { groupId: null } }
      }
    } as never);

    const result = await createSettlementRequest("user-1", "debt-1", {
      amount: "50",
      accountId: "acc-1",
      categoryId: "cat-1"
    });

    expect(result.id).toBe("sr-1");
    expect(createNotificationsMock).toHaveBeenCalledWith(
      prismaMock,
      expect.arrayContaining([
        expect.objectContaining({ userId: "owner-1", type: "settlement_requested" })
      ])
    );
  });
});

describe("createSettlementRequest currencies", () => {
  const body = { amount: "50", accountId: "acc-1", categoryId: "cat-1" };

  function setup(debtCurrency: string, accountCurrency: string) {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(
      debtRow({ currency: debtCurrency }) as never
    );
    assertSettlementAccountMock.mockResolvedValue({ currency: accountCurrency } as never);
    assertSettlementCategoryMock.mockResolvedValue(undefined as never);
    prismaMock.settlementRequest.findFirst.mockResolvedValue(null);
    prismaMock.settlementRequest.create.mockResolvedValue({
      id: "sr-1",
      creditorUserId: "owner-1",
      debtor: { name: "User One" },
      amount: new Prisma.Decimal("50"),
      sharedExpenseParticipantId: "debt-1",
      sharedExpenseParticipant: {
        sharedExpenseId: "se-1",
        sharedExpense: { title: "Dinner", transaction: { groupId: null } }
      }
    } as never);
  }

  it.each(["BTC", "KWD"])("rejects a %s debt as not shareable", async (currency) => {
    setup(currency, currency);

    await expect(createSettlementRequest("user-1", "debt-1", body)).rejects.toMatchObject({
      statusCode: 400,
      message: "Sharing is only supported for fiat currencies with up to 2 decimals"
    });
  });

  it("rejects a non-shareable account currency", async () => {
    setup("USD", "BTC");

    await expect(createSettlementRequest("user-1", "debt-1", body)).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it("accepts MXN", async () => {
    setup("MXN", "MXN");

    await expect(createSettlementRequest("user-1", "debt-1", body)).resolves.toMatchObject({
      id: "sr-1"
    });
  });

  it("rejects over-precise amounts for the debt currency", async () => {
    setup("USD", "USD");

    await expect(
      createSettlementRequest("user-1", "debt-1", { ...body, amount: "50.005" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("requires accountAmount for an account in another currency than the debt, naming it", async () => {
    setup("USD", "MXN");

    await expect(createSettlementRequest("user-1", "debt-1", body)).rejects.toMatchObject({
      statusCode: 400,
      details: { issues: { fieldErrors: { accountAmount: expect.any(Array) } } }
    });
  });

  it("stores the debtor's accountAmount for a cross-currency account", async () => {
    setup("USD", "MXN");

    await createSettlementRequest("user-1", "debt-1", { ...body, accountAmount: "850" });

    const data = prismaMock.settlementRequest.create.mock.calls[0]?.[0].data as unknown as Record<string, Prisma.Decimal>;
    expect(data.debtorAccountAmount?.toFixed()).toBe("850");
  });
});

describe("createBatchSettlementRequests", () => {
  it("creates a request for each entry, sequentially", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(
      debtRow() as never
    );
    assertSettlementAccountMock.mockResolvedValue({ currency: "USD" } as never);
    assertSettlementCategoryMock.mockResolvedValue(undefined as never);
    prismaMock.settlementRequest.findFirst.mockResolvedValue(null);
    prismaMock.settlementRequest.create.mockResolvedValue({
      id: "sr-1",
      creditorUserId: "owner-1",
      debtor: { name: "User One" },
      amount: { toNumber: () => 50 },
      sharedExpenseParticipantId: "debt-1",
      sharedExpenseParticipant: {
        sharedExpenseId: "se-1",
        sharedExpense: { title: "Dinner", transaction: { groupId: null } }
      }
    } as never);

    const results = await createBatchSettlementRequests("user-1", [
      { debtId: "debt-1", amount: "50", accountId: "acc-1", categoryId: "cat-1" }
    ]);

    expect(results).toHaveLength(1);
  });
});
