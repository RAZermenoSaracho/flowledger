import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../transactionValidation.service.js", () => ({
  assertExpenseOffsetAllowed: vi.fn(),
  assertGroupRelations: vi.fn(),
  assertOwnedRelations: vi.fn(),
  assertTransferAllowed: vi.fn()
}));

vi.mock("../../../shared-expenses/services/create.service.js", () => ({
  createSharedExpenseForTransaction: vi.fn()
}));

vi.mock("../../utils/transactionCurrency.js", () => ({
  resolveTransactionCurrencyFields: vi.fn()
}));

vi.mock("../importedTransactionValidation.service.js", () => ({
  assertImportedTransactionCategory: vi.fn(),
  clearProviderPendingNotifications: vi.fn()
}));

const { assertTransferAllowed } = await import("../transactionValidation.service.js");
const { createSharedExpenseForTransaction } = await import(
  "../../../shared-expenses/services/create.service.js"
);
const { resolveTransactionCurrencyFields } = await import(
  "../../utils/transactionCurrency.js"
);
const { assertImportedTransactionCategory, clearProviderPendingNotifications } =
  await import("../importedTransactionValidation.service.js");

const assertTransferAllowedMock = vi.mocked(assertTransferAllowed);
const createSharedExpenseForTransactionMock = vi.mocked(
  createSharedExpenseForTransaction
);
const resolveTransactionCurrencyFieldsMock = vi.mocked(
  resolveTransactionCurrencyFields
);
const assertImportedTransactionCategoryMock = vi.mocked(
  assertImportedTransactionCategory
);
const clearProviderPendingNotificationsMock = vi.mocked(
  clearProviderPendingNotifications
);

const {
  batchImportProviderImportedTransactions,
  createTransaction,
  importProviderImportedTransaction
} = await import("../create.service.js");

function mockTx() {
  return {
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-1" }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "txn-1" })
    }
  };
}

describe("createTransaction", () => {
  it("runs all validation checks before creating", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: null
    } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "USD",
      exchangeRate: 1,
      amountInPreferredCurrency: 100
    });
    const tx = mockTx();
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await createTransaction("user-1", {
      name: "Coffee",
      amount: 5,
      type: "expense",
      date: "2024-01-01"
    });

    expect(assertTransferAllowedMock).toHaveBeenCalled();
    expect(tx.transaction.create).toHaveBeenCalled();
    expect(createSharedExpenseForTransactionMock).not.toHaveBeenCalled();
  });

  it("creates the attached shared expense when sharedExpense is given", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: null
    } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "USD",
      exchangeRate: 1,
      amountInPreferredCurrency: 100
    });
    const tx = mockTx();
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await createTransaction("user-1", {
      name: "Dinner",
      amount: 100,
      type: "expense",
      date: "2024-01-01",
      sharedExpense: { title: "Dinner split", participants: [] }
    });

    expect(createSharedExpenseForTransactionMock).toHaveBeenCalled();
  });
});

describe("importProviderImportedTransaction", () => {
  it("throws a 404 when the imported transaction isn't owned by the user", async () => {
    prismaMock.providerImportedTransaction.findFirst.mockResolvedValue(null);

    await expect(
      importProviderImportedTransaction({ id: "it-1", userId: "user-1" })
    ).rejects.toThrow("Imported transaction not found");
  });

  it("throws a 400 when the row isn't pending", async () => {
    prismaMock.providerImportedTransaction.findFirst.mockResolvedValue({
      id: "it-1",
      status: "processed",
      amount: new Prisma.Decimal("-10")
    } as never);

    await expect(
      importProviderImportedTransaction({ id: "it-1", userId: "user-1" })
    ).rejects.toThrow("Only pending imported transactions can be imported");
  });

  it("throws a 400 when there's no category to use", async () => {
    prismaMock.providerImportedTransaction.findFirst.mockResolvedValue({
      id: "it-1",
      status: "pending",
      amount: new Prisma.Decimal("-10"),
      categoryId: null
    } as never);
    assertImportedTransactionCategoryMock.mockResolvedValue(null);

    await expect(
      importProviderImportedTransaction({ id: "it-1", userId: "user-1" })
    ).rejects.toThrow("Category is required before importing");
  });

  it("creates the transaction, marks the row processed, and clears pending notifications", async () => {
    prismaMock.providerImportedTransaction.findFirst.mockResolvedValue({
      id: "it-1",
      status: "pending",
      amount: new Prisma.Decimal("-10"),
      categoryId: "cat-1",
      currency: "USD",
      description: "Coffee"
    } as never);
    assertImportedTransactionCategoryMock.mockResolvedValue({ id: "cat-1" } as never);
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: null
    } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "USD",
      exchangeRate: 1,
      amountInPreferredCurrency: 10
    });

    const tx = {
      providerImportedTransaction: {
        findFirst: vi.fn().mockResolvedValue({
          id: "it-1",
          status: "pending",
          amount: new Prisma.Decimal("-10"),
          description: "Coffee",
          transactionDate: new Date(),
          providerAccount: { accountId: "acc-1" }
        }),
        update: vi.fn().mockResolvedValue({ id: "it-1", status: "processed" })
      },
      transaction: { create: vi.fn().mockResolvedValue({ id: "txn-1" }) }
    };
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    const result = await importProviderImportedTransaction({
      id: "it-1",
      userId: "user-1"
    });

    expect(tx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "expense", categoryId: "cat-1" })
      })
    );
    expect(tx.providerImportedTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "processed", transactionId: "txn-1" })
      })
    );
    expect(clearProviderPendingNotificationsMock).toHaveBeenCalled();
    expect(result.id).toBe("it-1");
  });
});

describe("batchImportProviderImportedTransactions", () => {
  it("throws a 400 collecting errors for every invalid row, importing nothing", async () => {
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      { id: "it-1", status: "processed", amount: new Prisma.Decimal("-1") },
      { id: "it-2", status: "pending", amount: new Prisma.Decimal("0") }
    ] as never);

    await expect(
      batchImportProviderImportedTransactions("user-1", {
        selection: { mode: "ids", ids: ["it-1", "it-2"] }
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      details: {
        errors: [
          { id: "it-1", message: "Only pending imported transactions can be imported" },
          {
            id: "it-2",
            message:
              "Imported transactions with a zero amount cannot be imported"
          }
        ]
      }
    });
  });

  it("throws a 400 when a row has no resolvable category", async () => {
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      { id: "it-1", status: "pending", amount: new Prisma.Decimal("-1"), categoryId: null }
    ] as never);

    await expect(
      batchImportProviderImportedTransactions("user-1", {
        selection: { mode: "ids", ids: ["it-1"] }
      })
    ).rejects.toMatchObject({
      details: {
        errors: [{ id: "it-1", message: "Category is required before importing" }]
      }
    });
  });
});
