import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../transactionValidation.service.js", () => ({
  assertExpenseOffsetAllowed: vi.fn(),
  assertGroupRelations: vi.fn(),
  assertOwnedRelations: vi.fn(),
  assertTransferAllowed: vi.fn()
}));

vi.mock("../../utils/sharedTransactionCleanup.js", () => ({
  deleteSharedTransactionData: vi.fn()
}));

vi.mock("../../utils/transactionCurrency.js", () => ({
  resolveTransactionCurrencyFields: vi.fn()
}));

vi.mock("../importedTransactionValidation.service.js", () => ({
  assertImportedTransactionCategory: vi.fn(),
  clearProviderPendingNotifications: vi.fn()
}));

vi.mock("../../utils/importedTransactionQuery.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../utils/importedTransactionQuery.js")
  >();
  return { ...actual, resolveImportedTransactionSelectionIds: vi.fn() };
});

const { deleteSharedTransactionData } = await import(
  "../../utils/sharedTransactionCleanup.js"
);
const { resolveTransactionCurrencyFields } = await import(
  "../../utils/transactionCurrency.js"
);
const { assertImportedTransactionCategory } = await import(
  "../importedTransactionValidation.service.js"
);
const { resolveImportedTransactionSelectionIds } = await import(
  "../../utils/importedTransactionQuery.js"
);

const deleteSharedTransactionDataMock = vi.mocked(deleteSharedTransactionData);
const resolveTransactionCurrencyFieldsMock = vi.mocked(
  resolveTransactionCurrencyFields
);
const assertImportedTransactionCategoryMock = vi.mocked(
  assertImportedTransactionCategory
);
const resolveImportedTransactionSelectionIdsMock = vi.mocked(
  resolveImportedTransactionSelectionIds
);

const {
  batchIgnoreImportedTransactions,
  batchUnignoreImportedTransactions,
  ignoreImportedTransaction,
  unignoreImportedTransaction,
  updateImportedTransactionCategory,
  updateTransaction
} = await import("../update.service.js");

function existingTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "txn-1",
    userId: "user-1",
    type: "expense",
    accountId: "acc-1",
    transferToAccountId: null,
    groupId: null,
    categoryId: "cat-1",
    expenseOffsetCategoryId: null,
    executionCurrency: "USD",
    amount: { toNumber: () => 100 },
    exchangeRate: { toNumber: () => 1 },
    sharedExpense: null,
    ...overrides
  };
}

function mockTx(overrides: Record<string, unknown> = {}) {
  return {
    transaction: {
      update: vi.fn().mockResolvedValue({ id: "txn-1", type: "expense", amount: 50 })
    },
    sharedExpense: { updateMany: vi.fn() },
    ...overrides
  };
}

describe("updateTransaction", () => {
  it("throws a 404 when not owned by the user", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue(null);

    await expect(
      updateTransaction("user-1", "txn-1", { amount: 50 })
    ).rejects.toThrow("Transaction not found");
  });

  it("recomputes amountInPreferredCurrency from the existing exchange rate when only amount changes", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue(
      existingTransaction() as never
    );
    const tx = mockTx();
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await updateTransaction("user-1", "txn-1", { amount: 50 });

    expect(resolveTransactionCurrencyFieldsMock).not.toHaveBeenCalled();
    expect(tx.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amountInPreferredCurrency: 50 })
      })
    );
  });

  it("recomputes full currency fields via the live rate when executionCurrency changes", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue(
      existingTransaction() as never
    );
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: null
    } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "MXN",
      exchangeRate: 17,
      amountInPreferredCurrency: 1700
    });
    const tx = mockTx();
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await updateTransaction("user-1", "txn-1", { executionCurrency: "MXN" });

    expect(resolveTransactionCurrencyFieldsMock).toHaveBeenCalled();
  });

  it("updates the linked shared expense's totalAmount when amount changes", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue(
      existingTransaction() as never
    );
    const tx = mockTx();
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await updateTransaction("user-1", "txn-1", { amount: 75 });

    expect(tx.sharedExpense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { transactionId: "txn-1" } })
    );
  });

  it("cleans up shared-expense data when the transaction becomes a transfer", async () => {
    const existing = existingTransaction({ sharedExpense: { id: "se-1" } });
    prismaMock.transaction.findFirst.mockResolvedValue(existing as never);
    const tx = mockTx({
      transaction: {
        update: vi.fn().mockResolvedValue({ id: "txn-1", type: "transfer" })
      }
    });
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await updateTransaction("user-1", "txn-1", { type: "transfer" });

    expect(deleteSharedTransactionDataMock).toHaveBeenCalledWith(
      tx,
      existing.sharedExpense
    );
  });
});

describe("updateImportedTransactionCategory", () => {
  it("throws a 404 when not owned by the user", async () => {
    prismaMock.providerImportedTransaction.findFirst.mockResolvedValue(null);

    await expect(
      updateImportedTransactionCategory("user-1", "it-1", { categoryId: "cat-1" })
    ).rejects.toThrow("Imported transaction not found");
  });

  it("throws a 400 when the row isn't pending", async () => {
    prismaMock.providerImportedTransaction.findFirst.mockResolvedValue({
      id: "it-1",
      status: "processed",
      amount: { toNumber: () => -1, lessThan: () => true, greaterThan: () => false }
    } as never);

    await expect(
      updateImportedTransactionCategory("user-1", "it-1", { categoryId: "cat-1" })
    ).rejects.toThrow("Only pending imported transactions can be updated");
  });

  it("updates the category after validating it", async () => {
    prismaMock.providerImportedTransaction.findFirst.mockResolvedValue({
      id: "it-1",
      status: "pending",
      amount: { toNumber: () => -1, lessThan: () => true, greaterThan: () => false }
    } as never);
    assertImportedTransactionCategoryMock.mockResolvedValue(null);
    prismaMock.providerImportedTransaction.update.mockResolvedValue({
      id: "it-1",
      categoryId: "cat-1"
    } as never);

    const result = await updateImportedTransactionCategory("user-1", "it-1", {
      categoryId: "cat-1"
    });

    expect(result).toMatchObject({ categoryId: "cat-1" });
  });
});

describe("ignoreImportedTransaction", () => {
  it("marks a pending row ignored", async () => {
    const tx = {
      providerImportedTransaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "it-1", status: "ignored" })
      }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    const result = await ignoreImportedTransaction("user-1", "it-1");
    expect(result).toMatchObject({ status: "ignored" });
  });

  it("throws a 404 when the row doesn't exist at all", async () => {
    const tx = {
      providerImportedTransaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue(null)
      }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await expect(ignoreImportedTransaction("user-1", "it-1")).rejects.toThrow(
      "Imported transaction not found"
    );
  });

  it("throws a 400 when the row exists but isn't pending", async () => {
    const tx = {
      providerImportedTransaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue({ id: "it-1", status: "processed" })
      }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await expect(ignoreImportedTransaction("user-1", "it-1")).rejects.toThrow(
      "Only pending imported transactions can be ignored"
    );
  });
});

describe("unignoreImportedTransaction", () => {
  it("reverts an ignored row back to pending", async () => {
    const tx = {
      providerImportedTransaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "it-1", status: "pending" })
      }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    const result = await unignoreImportedTransaction("user-1", "it-1");
    expect(result).toMatchObject({ status: "pending" });
  });

  it("throws a 400 when the row isn't currently ignored", async () => {
    const tx = {
      providerImportedTransaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue({ id: "it-1", status: "pending" })
      }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await expect(unignoreImportedTransaction("user-1", "it-1")).rejects.toThrow(
      "Only ignored imported transactions can be unignored"
    );
  });
});

describe("batchIgnoreImportedTransactions", () => {
  it("throws a 400 collecting errors for every non-pending row, ignoring none", async () => {
    resolveImportedTransactionSelectionIdsMock.mockResolvedValue(["it-1"]);
    const tx = {
      providerImportedTransaction: {
        findMany: vi.fn().mockResolvedValue([{ id: "it-1", status: "processed" }]),
        updateMany: vi.fn()
      }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await expect(
      batchIgnoreImportedTransactions("user-1", { mode: "ids", ids: ["it-1"] })
    ).rejects.toMatchObject({
      statusCode: 400,
      details: {
        errors: [{ id: "it-1", message: "Only pending imported transactions can be ignored" }]
      }
    });
    expect(tx.providerImportedTransaction.updateMany).not.toHaveBeenCalled();
  });

  it("ignores every pending row in the selection", async () => {
    resolveImportedTransactionSelectionIdsMock.mockResolvedValue(["it-1", "it-2"]);
    const tx = {
      providerImportedTransaction: {
        findMany: vi.fn().mockResolvedValue([
          { id: "it-1", status: "pending" },
          { id: "it-2", status: "pending" }
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 })
      }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    const count = await batchIgnoreImportedTransactions("user-1", {
      mode: "ids",
      ids: ["it-1", "it-2"]
    });

    expect(count).toBe(2);
  });
});

describe("batchUnignoreImportedTransactions", () => {
  it("throws a 400 when a selected row isn't ignored", async () => {
    resolveImportedTransactionSelectionIdsMock.mockResolvedValue(["it-1"]);
    const tx = {
      providerImportedTransaction: {
        findMany: vi.fn().mockResolvedValue([{ id: "it-1", status: "pending" }]),
        updateMany: vi.fn()
      }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await expect(
      batchUnignoreImportedTransactions("user-1", { mode: "ids", ids: ["it-1"] })
    ).rejects.toMatchObject({
      statusCode: 400,
      details: {
        errors: [{ id: "it-1", message: "Only ignored imported transactions can be unignored" }]
      }
    });
  });

  it("unignores every ignored row in the selection", async () => {
    resolveImportedTransactionSelectionIdsMock.mockResolvedValue(["it-1"]);
    const tx = {
      providerImportedTransaction: {
        findMany: vi.fn().mockResolvedValue([{ id: "it-1", status: "ignored" }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    const count = await batchUnignoreImportedTransactions("user-1", {
      mode: "ids",
      ids: ["it-1"]
    });

    expect(count).toBe(1);
  });
});
