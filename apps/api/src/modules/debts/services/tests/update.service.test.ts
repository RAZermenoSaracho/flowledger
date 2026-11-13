import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../../notifications/services/create.service.js", () => ({
  createNotifications: vi.fn()
}));

vi.mock("../../../transactions/utils/transactionCurrency.js", () => ({
  resolveTransactionCurrencyFields: vi.fn()
}));

vi.mock("../settlementValidation.service.js", () => ({
  assertSettlementAccount: vi.fn(),
  assertSettlementCategory: vi.fn(),
  resolveSettlementExpenseOffsetCategoryId: vi.fn()
}));

const { createNotifications } = await import(
  "../../../notifications/services/create.service.js"
);
const { resolveTransactionCurrencyFields } = await import(
  "../../../transactions/utils/transactionCurrency.js"
);
const {
  assertSettlementAccount,
  assertSettlementCategory,
  resolveSettlementExpenseOffsetCategoryId
} = await import("../settlementValidation.service.js");

const createNotificationsMock = vi.mocked(createNotifications);
const resolveTransactionCurrencyFieldsMock = vi.mocked(resolveTransactionCurrencyFields);
const assertSettlementAccountMock = vi.mocked(assertSettlementAccount);
const assertSettlementCategoryMock = vi.mocked(assertSettlementCategory);
const resolveSettlementExpenseOffsetCategoryIdMock = vi.mocked(
  resolveSettlementExpenseOffsetCategoryId
);

const {
  approveBatchSettlements,
  approveSettlement,
  rejectSettlement,
  settleDebtDirectly,
  settleSharedExpenseIfComplete
} = await import("../update.service.js");

function debtRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "debt-1",
    sharedExpenseId: "se-1",
    userId: "user-1",
    currency: "USD",
    shareAmount: new Prisma.Decimal("100"),
    paidAmount: new Prisma.Decimal("0"),
    acceptance: "accepted",
    sharedExpense: {
      ownerUserId: "owner-1",
      title: "Dinner",
      transaction: { type: "expense" as const, groupId: null, categoryId: "cat-orig" }
    },
    settlementRequests: [],
    ...overrides
  };
}

describe("settleSharedExpenseIfComplete", () => {
  it("marks the shared expense settled when no participants remain unpaid", async () => {
    prismaMock.sharedExpenseParticipant.count.mockResolvedValue(0);
    prismaMock.sharedExpense.update.mockResolvedValue({} as never);

    await settleSharedExpenseIfComplete("se-1");

    expect(prismaMock.sharedExpense.update).toHaveBeenCalledWith({
      where: { id: "se-1" },
      data: { status: "settled" }
    });
  });

  it("does nothing when participants are still unpaid", async () => {
    prismaMock.sharedExpenseParticipant.count.mockResolvedValue(1);

    await settleSharedExpenseIfComplete("se-1");

    expect(prismaMock.sharedExpense.update).not.toHaveBeenCalled();
  });
});

describe("settleDebtDirectly", () => {
  it("throws a 404 when the debt doesn't exist", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(null);

    await expect(settleDebtDirectly("owner-1", "debt-1")).rejects.toThrow(
      "Debt not found"
    );
  });

  it("scopes the lookup to the creditor, so a non-creditor gets the same 404", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(null);

    await expect(settleDebtDirectly("not-the-owner", "debt-1")).rejects.toThrow(
      "Debt not found"
    );
    expect(prismaMock.sharedExpenseParticipant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "debt-1",
          OR: [
            { sharedExpense: { ownerUserId: "not-the-owner", transaction: { type: "expense" } } },
            { userId: "not-the-owner", sharedExpense: { transaction: { type: "income" } } }
          ]
        }
      })
    );
  });

  it("throws a 400 when the share has not been accepted", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(
      debtRow({ acceptance: "proposed" }) as never
    );

    await expect(settleDebtDirectly("owner-1", "debt-1")).rejects.toThrow(
      "This share has not been accepted"
    );
  });

  it("throws a 400 when the debt is already settled", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(
      debtRow({
        shareAmount: new Prisma.Decimal("100"),
        paidAmount: new Prisma.Decimal("100")
      }) as never
    );

    await expect(settleDebtDirectly("owner-1", "debt-1")).rejects.toThrow(
      "Debt is already settled"
    );
  });

  it("marks the debt paid, approves pending requests, and notifies the debtor", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(
      debtRow() as never
    );
    prismaMock.sharedExpenseParticipant.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.settlementRequest.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.sharedExpenseParticipant.findUniqueOrThrow.mockResolvedValue(
      debtRow({ paidAmount: new Prisma.Decimal("100"), status: "paid" }) as never
    );
    prismaMock.settlementRequest.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.sharedExpenseParticipant.count.mockResolvedValue(0);
    prismaMock.sharedExpense.update.mockResolvedValue({} as never);

    const result = await settleDebtDirectly("owner-1", "debt-1");

    expect(prismaMock.settlementRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "approved" })
      })
    );
    expect(createNotificationsMock).toHaveBeenCalledWith(
      prismaMock,
      expect.arrayContaining([
        expect.objectContaining({ userId: "user-1", type: "settlement_approved" }),
        expect.objectContaining({
          userId: "user-1",
          type: "settlement_payment_registration_needed"
        })
      ])
    );
    expect(result.debt).toBeDefined();
  });
});

describe("rejectSettlement", () => {
  it("throws a 404 when there's no matching pending request", async () => {
    prismaMock.settlementRequest.findFirst.mockResolvedValue(null);

    await expect(rejectSettlement("owner-1", "sr-1")).rejects.toThrow(
      "Settlement request not found"
    );
  });

  it("rejects the request and notifies the debtor", async () => {
    prismaMock.settlementRequest.findFirst.mockResolvedValue({ id: "sr-1" } as never);
    prismaMock.settlementRequest.update.mockResolvedValue({
      id: "sr-1",
      debtorUserId: "user-1",
      creditor: { name: "Owner" },
      amount: new Prisma.Decimal("50"),
      sharedExpenseParticipantId: "debt-1",
      sharedExpenseParticipant: {
        currency: "USD",
        sharedExpenseId: "se-1",
        sharedExpense: { title: "Dinner", transaction: { groupId: null } }
      }
    } as never);

    await rejectSettlement("owner-1", "sr-1");

    expect(createNotificationsMock).toHaveBeenCalledWith(
      prismaMock,
      expect.arrayContaining([
        expect.objectContaining({ userId: "user-1", type: "settlement_rejected" })
      ])
    );
  });
});

function pendingSettlementRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "sr-1",
    debtorUserId: "user-1",
    creditorUserId: "owner-1",
    debtor: { id: "user-1", name: "Debtor User" },
    creditor: { id: "owner-1", name: "Owner" },
    amount: Object.assign(new Prisma.Decimal("50"), {}),
    debtorAccountId: "debtor-acc",
    debtorCategoryId: "debtor-cat",
    debtorTransactionId: null,
    creditorTransactionId: null,
    note: null,
    paymentInfo: null,
    approvedAt: null,
    sharedExpenseParticipant: debtRow(),
    ...overrides
  };
}

describe("approveSettlement", () => {
  it("throws a 404 when there's no matching pending request", async () => {
    prismaMock.settlementRequest.findFirst.mockResolvedValue(null);

    await expect(
      approveSettlement("owner-1", "sr-1", { accountId: "a", categoryId: "c" })
    ).rejects.toThrow("Settlement request not found");
  });

  it("throws a 400 when the settlement direction no longer matches the debt", async () => {
    prismaMock.settlementRequest.findFirst.mockResolvedValue(
      pendingSettlementRequest({
        sharedExpenseParticipant: debtRow({
          sharedExpense: {
            ownerUserId: "owner-1",
            title: "Dinner",
            // income flips debtor/creditor, making the stored request stale
            transaction: { type: "income" as const, groupId: null }
          }
        })
      }) as never
    );

    await expect(
      approveSettlement("owner-1", "sr-1", { accountId: "a", categoryId: "c" })
    ).rejects.toThrow("Settlement request does not match the current debt direction");
  });

  it("throws a 400 when the request amount now exceeds the outstanding balance", async () => {
    prismaMock.settlementRequest.findFirst.mockResolvedValue(
      pendingSettlementRequest({
        amount: new Prisma.Decimal("500")
      }) as never
    );

    await expect(
      approveSettlement("owner-1", "sr-1", { accountId: "a", categoryId: "c" })
    ).rejects.toThrow("Settlement request exceeds the current outstanding balance");
  });

  it("throws a 409 when the settlement already has transactions", async () => {
    prismaMock.settlementRequest.findFirst.mockResolvedValue(
      pendingSettlementRequest() as never
    );
    prismaMock.sharedExpenseParticipant.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.settlementRequest.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.sharedExpenseParticipant.findUniqueOrThrow.mockResolvedValue(
      debtRow() as never
    );
    prismaMock.settlementRequest.update.mockResolvedValue(
      pendingSettlementRequest({ debtorTransactionId: "already-exists" }) as never
    );

    await expect(
      approveSettlement("owner-1", "sr-1", { accountId: "a", categoryId: "c" })
    ).rejects.toThrow("Settlement transactions already exist");
  });

  it("creates the debtor/creditor transaction pair and relation on the happy path", async () => {
    prismaMock.settlementRequest.findFirst.mockResolvedValue(
      pendingSettlementRequest() as never
    );
    prismaMock.sharedExpenseParticipant.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.settlementRequest.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.sharedExpenseParticipant.findUniqueOrThrow.mockResolvedValue(
      debtRow({ paidAmount: new Prisma.Decimal("50") }) as never
    );
    prismaMock.settlementRequest.update.mockResolvedValue(
      pendingSettlementRequest() as never
    );
    assertSettlementAccountMock.mockResolvedValue({
      currency: "USD"
    } as never);
    assertSettlementCategoryMock.mockResolvedValue(undefined as never);
    resolveSettlementExpenseOffsetCategoryIdMock.mockResolvedValue(null);
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: null
    } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "USD",
      exchangeRate: 1,
      amountInPreferredCurrency: new Prisma.Decimal("50")
    });
    prismaMock.transaction.create
      .mockResolvedValueOnce({ id: "debtor-txn" } as never)
      .mockResolvedValueOnce({ id: "creditor-txn" } as never);
    prismaMock.transactionRelation.createMany.mockResolvedValue({
      count: 2
    } as never);
    prismaMock.sharedExpenseParticipant.count.mockResolvedValue(0);
    prismaMock.sharedExpense.update.mockResolvedValue({} as never);

    const result = await approveSettlement("owner-1", "sr-1", {
      accountId: "creditor-acc",
      categoryId: "creditor-cat"
    });

    expect(prismaMock.transaction.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.transactionRelation.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            transactionId: "debtor-txn",
            relatedTransactionId: "creditor-txn"
          })
        ])
      })
    );
    expect(createNotificationsMock).toHaveBeenCalled();
    // The returned debt goes through balanceDebt() (same as
    // settleDebtDirectly's return), so it carries the computed
    // outstandingAmount a caller needs without a follow-up fetch.
    expect(result.debt.outstandingAmount).toEqual(new Prisma.Decimal("50"));
  });
});

describe("approveSettlement applied amounts", () => {
  function setup(accounts: { debtor: string; creditor: string }, debtCurrency = "USD") {
    prismaMock.settlementRequest.findFirst.mockResolvedValue(
      pendingSettlementRequest({
        sharedExpenseParticipant: debtRow({ currency: debtCurrency })
      }) as never
    );
    prismaMock.sharedExpenseParticipant.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.settlementRequest.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.sharedExpenseParticipant.findUniqueOrThrow.mockResolvedValue(
      debtRow({ currency: debtCurrency, paidAmount: new Prisma.Decimal("50") }) as never
    );
    prismaMock.settlementRequest.update.mockResolvedValue(
      pendingSettlementRequest({
        sharedExpenseParticipant: debtRow({ currency: debtCurrency })
      }) as never
    );
    assertSettlementAccountMock
      .mockResolvedValueOnce({ currency: accounts.debtor } as never)
      .mockResolvedValueOnce({ currency: accounts.creditor } as never);
    assertSettlementCategoryMock.mockResolvedValue(undefined as never);
    resolveSettlementExpenseOffsetCategoryIdMock.mockResolvedValue(null);
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ preferredCurrency: null } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: debtCurrency,
      exchangeRate: 1,
      amountInPreferredCurrency: new Prisma.Decimal("50")
    });
    prismaMock.transaction.create
      .mockResolvedValueOnce({ id: "debtor-txn" } as never)
      .mockResolvedValueOnce({ id: "creditor-txn" } as never);
    prismaMock.transactionRelation.createMany.mockResolvedValue({ count: 2 } as never);
    prismaMock.sharedExpenseParticipant.count.mockResolvedValue(1);
  }
  const approval = { accountId: "creditor-acc", categoryId: "creditor-cat" };

  it("copies the settlement amount to both sides for matching currencies, without any rate lookup", async () => {
    setup({ debtor: "USD", creditor: "USD" });

    await approveSettlement("owner-1", "sr-1", approval);

    const [debtorCall, creditorCall] = prismaMock.transaction.create.mock.calls.map(
      ([args]) => args.data as unknown as Record<string, Prisma.Decimal>
    );
    expect(debtorCall?.accountAmount?.toFixed()).toBe("50");
    expect(creditorCall?.accountAmount?.toFixed()).toBe("50");
  });

  it("applies the stored debtorAccountAmount to the debtor transaction for a cross-currency debtor account", async () => {
    setup({ debtor: "MXN", creditor: "USD" });
    const withAmount = pendingSettlementRequest({ debtorAccountAmount: new Prisma.Decimal("850") }) as never;
    prismaMock.settlementRequest.findFirst.mockResolvedValue(withAmount);
    prismaMock.settlementRequest.update.mockResolvedValue(withAmount);

    await approveSettlement("owner-1", "sr-1", approval);

    const debtorData = prismaMock.transaction.create.mock.calls[0]?.[0].data as unknown as Record<string, Prisma.Decimal>;
    expect(debtorData.accountAmount?.toFixed()).toBe("850");
  });

  it("rejects approval into an account in another currency without accountAmount, naming it", async () => {
    setup({ debtor: "USD", creditor: "MXN" });

    await expect(approveSettlement("owner-1", "sr-1", approval)).rejects.toMatchObject({
      statusCode: 400,
      details: { issues: { fieldErrors: { accountAmount: expect.any(Array) } } }
    });
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });

  it("persists the creditor's stated accountAmount for a cross-currency account", async () => {
    setup({ debtor: "USD", creditor: "MXN" });

    await approveSettlement("owner-1", "sr-1", { ...approval, accountAmount: "850" });

    const creditorData = prismaMock.transaction.create.mock.calls[1]?.[0].data as unknown as Record<
      string,
      Prisma.Decimal
    >;
    expect(creditorData.accountAmount?.toFixed()).toBe("850");
  });

  it.each(["BTC", "KWD"])("accepts approving a %s settlement", async (currency) => {
    setup({ debtor: currency, creditor: currency }, currency);
    await expect(approveSettlement("owner-1", "sr-1", approval)).resolves.toMatchObject({
      debt: { outstandingAmount: new Prisma.Decimal("50") }
    });
  });
});

describe("approveBatchSettlements", () => {
  it("approves each entry sequentially", async () => {
    prismaMock.settlementRequest.findFirst.mockResolvedValue(
      pendingSettlementRequest() as never
    );
    prismaMock.sharedExpenseParticipant.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.settlementRequest.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.sharedExpenseParticipant.findUniqueOrThrow.mockResolvedValue(
      debtRow({ paidAmount: new Prisma.Decimal("50") }) as never
    );
    prismaMock.settlementRequest.update.mockResolvedValue(
      pendingSettlementRequest() as never
    );
    assertSettlementAccountMock.mockResolvedValue({ currency: "USD" } as never);
    assertSettlementCategoryMock.mockResolvedValue(undefined as never);
    resolveSettlementExpenseOffsetCategoryIdMock.mockResolvedValue(null);
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: null
    } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "USD",
      exchangeRate: 1,
      amountInPreferredCurrency: new Prisma.Decimal("50")
    });
    prismaMock.transaction.create
      .mockResolvedValueOnce({ id: "debtor-txn" } as never)
      .mockResolvedValueOnce({ id: "creditor-txn" } as never);
    prismaMock.transactionRelation.createMany.mockResolvedValue({
      count: 2
    } as never);
    prismaMock.sharedExpenseParticipant.count.mockResolvedValue(1);

    const results = await approveBatchSettlements("owner-1", [
      {
        settlementRequestId: "sr-1",
        accountId: "creditor-acc",
        categoryId: "creditor-cat"
      }
    ]);

    expect(results).toHaveLength(1);
  });
});

describe("compare-and-set guards", () => {
  it("settleDebtDirectly throws 409 when the paid amount changed under it", async () => {
    prismaMock.sharedExpenseParticipant.findFirst.mockResolvedValue(debtRow() as never);
    prismaMock.sharedExpenseParticipant.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(settleDebtDirectly("owner-1", "debt-1")).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.settlementRequest.updateMany).not.toHaveBeenCalled();
  });

  it("approveSettlement throws 409 when the request was already resolved", async () => {
    prismaMock.settlementRequest.findFirst.mockResolvedValue(pendingSettlementRequest() as never);
    prismaMock.settlementRequest.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      approveSettlement("owner-1", "sr-1", { accountId: "a", categoryId: "c" })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.sharedExpenseParticipant.updateMany).not.toHaveBeenCalled();
  });

  it("approveSettlement throws 409 when paidAmount no longer matches what was read", async () => {
    prismaMock.settlementRequest.findFirst.mockResolvedValue(pendingSettlementRequest() as never);
    prismaMock.settlementRequest.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.sharedExpenseParticipant.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      approveSettlement("owner-1", "sr-1", { accountId: "a", categoryId: "c" })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });
});
