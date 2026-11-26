import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../transactionValidation.service.js", () => ({
  assertExpenseOffsetAllowed: vi.fn(),
  assertGroupRelations: vi.fn(),
  assertOwnedRelations: vi.fn(),
  assertTransferAllowed: vi.fn(),
  findAccountCurrencies: vi.fn(),
  resolveCreditCardKind: vi.fn()
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

vi.mock("../../utils/importedTransactionQuery.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/importedTransactionQuery.js")>();
  return { ...actual, resolveImportedTransactionSelectionIds: vi.fn(actual.resolveImportedTransactionSelectionIds) };
});

const { resolveImportedTransactionSelectionIds } = await import("../../utils/importedTransactionQuery.js");
const { assertTransferAllowed, findAccountCurrencies } = await import(
  "../transactionValidation.service.js"
);
const findAccountCurrenciesMock = vi.mocked(findAccountCurrencies);
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


function sourceRow(id: string, amount = "-1", description = "d", accountId: string | null = null) {
  return {
    id,
    status: "pending",
    amount: new Prisma.Decimal(amount),
    description,
    transactionDate: new Date(),
    providerAccount: accountId ? { accountId } : null
  };
}

/** Mocks the interactive transaction client for the claim-then-createMany import path and installs it as `prisma.$transaction`'s callback argument. */
function useImportTx(rows: ReturnType<typeof sourceRow>[]) {
  const tx = {
    providerImportedTransaction: {
      updateMany: vi.fn().mockResolvedValue({ count: rows.length }),
      findMany: vi.fn().mockResolvedValue(rows),
      update: vi.fn().mockResolvedValue({}),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: rows[0]?.id, status: "processed" })
    },
    transaction: { createMany: vi.fn().mockResolvedValue({ count: rows.length }) }
  };
  (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
  );
  return tx;
}

function createdData(tx: ReturnType<typeof useImportTx>, index = 0) {
  return tx.transaction.createMany.mock.calls[0]?.[0].data[index] as Record<string, Prisma.Decimal | string | null>;
}

beforeEach(() => {
  findAccountCurrenciesMock.mockResolvedValue({ accountCurrency: null, destinationCurrency: null });
});

describe("createTransaction", () => {
  it("runs all validation checks before creating", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: null
    } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "USD",
      exchangeRate: 1,
      amountInPreferredCurrency: new Prisma.Decimal("100")
    });
    const tx = mockTx();
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await createTransaction("user-1", {
      name: "Coffee",
      amount: "5",
      type: "expense",
      date: "2024-01-01"
    });

    expect(assertTransferAllowedMock).toHaveBeenCalled();
    expect(tx.transaction.create).toHaveBeenCalled();
    expect(createSharedExpenseForTransactionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-11-05", "2026-11-05T00:00:00.000Z"],
    ["2026-11-05T14:30:00-06:00", "2026-11-05T20:30:00.000Z"],
    ["2026-11-05T20:30:00.000Z", "2026-11-05T20:30:00.000Z"]
  ])("stores date %s as the UTC instant %s", async (input, expected) => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: null
    } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "USD",
      exchangeRate: 1,
      amountInPreferredCurrency: new Prisma.Decimal("100")
    });
    const tx = mockTx();
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await createTransaction("user-1", { name: "Coffee", amount: "5", type: "expense", date: input });

    const data = tx.transaction.create.mock.calls[0]?.[0].data as { date: Date };
    expect(data.date.toISOString()).toBe(expected);
  });

  it("creates the attached shared expense when sharedExpense is given", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: null
    } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "USD",
      exchangeRate: 1,
      amountInPreferredCurrency: new Prisma.Decimal("100")
    });
    const tx = mockTx();
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await createTransaction("user-1", {
      name: "Dinner",
      amount: "100",
      type: "expense",
      date: "2024-01-01",
      sharedExpense: { title: "Dinner split", participants: [] }
    });

    expect(createSharedExpenseForTransactionMock).toHaveBeenCalled();
  });

  it("writes on the given tx and opens no transaction of its own", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ preferredCurrency: null } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "USD",
      exchangeRate: 1,
      amountInPreferredCurrency: new Prisma.Decimal("100")
    });
    prismaMock.$transaction.mockClear();
    const tx = mockTx();

    await createTransaction(
      "user-1",
      { name: "Coffee", amount: "5", type: "expense", date: "2024-01-01" },
      tx as never
    );

    expect(tx.transaction.create).toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("createTransaction applied amounts", () => {
  function setup() {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ preferredCurrency: "MXN" } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "USD",
      exchangeRate: 17,
      amountInPreferredCurrency: new Prisma.Decimal("1700")
    });
    const tx = mockTx();
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );
    return tx;
  }

  it("persists a cross-currency transfer's stated destinationAmount and copies the source side", async () => {
    const tx = setup();
    findAccountCurrenciesMock.mockResolvedValue({ accountCurrency: "USD", destinationCurrency: "MXN" });

    await createTransaction("user-1", {
      name: "Move",
      amount: "100",
      type: "transfer",
      date: "2024-01-01",
      accountId: "acc-usd",
      transferToAccountId: "acc-mxn",
      destinationAmount: "1712.50"
    });

    const data = tx.transaction.create.mock.calls[0]?.[0].data as Record<string, Prisma.Decimal | null>;
    expect(data.accountAmount?.toFixed()).toBe("100");
    expect(data.destinationAmount?.toFixed()).toBe("1712.5");
    expect(data.feeAmount).toBeNull();
  });

  it("rejects an omitted destinationAmount across currencies with a 400 naming it, storing nothing", async () => {
    const tx = setup();
    findAccountCurrenciesMock.mockResolvedValue({ accountCurrency: "USD", destinationCurrency: "MXN" });

    await expect(
      createTransaction("user-1", {
        name: "Move",
        amount: "100",
        type: "transfer",
        date: "2024-01-01",
        accountId: "acc-usd",
        transferToAccountId: "acc-mxn"
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      details: { issues: { fieldErrors: { destinationAmount: expect.any(Array) } } }
    });
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it("copies amount into accountAmount for a same-currency expense", async () => {
    const tx = setup();
    findAccountCurrenciesMock.mockResolvedValue({ accountCurrency: "USD", destinationCurrency: null });

    await createTransaction("user-1", {
      name: "Coffee",
      amount: "5.25",
      type: "expense",
      date: "2024-01-01",
      accountId: "acc-usd",
      executionCurrency: "USD"
    });

    const data = tx.transaction.create.mock.calls[0]?.[0].data as Record<string, Prisma.Decimal | null>;
    expect(data.accountAmount?.toFixed()).toBe("5.25");
  });

  it("rejects over-precise fiat without rounding", async () => {
    setup();

    await expect(
      createTransaction("user-1", {
        name: "Coffee",
        amount: "5.005",
        type: "expense",
        date: "2024-01-01",
        executionCurrency: "USD"
      })
    ).rejects.toMatchObject({ statusCode: 400 });
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

  it("imports a positive row on a credit card without a category", async () => {
    prismaMock.providerImportedTransaction.findFirst.mockResolvedValue({
      id: "it-1",
      status: "pending",
      amount: new Prisma.Decimal("6000"),
      categoryId: null,
      currency: "MXN",
      description: "Payment",
      transactionDate: new Date(),
      providerAccount: { accountId: "card-1", account: { currency: "MXN", type: "credit_card" } }
    } as never);
    assertImportedTransactionCategoryMock.mockResolvedValue(null);
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ preferredCurrency: null } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "MXN",
      exchangeRate: 1,
      amountInPreferredCurrency: new Prisma.Decimal("6000")
    });
    const tx = useImportTx([sourceRow("it-1", "6000", "Payment", "card-1")]);

    await importProviderImportedTransaction({ id: "it-1", userId: "user-1" });

    expect(createdData(tx)).toMatchObject({
      type: "income",
      categoryId: null,
      accountId: "card-1"
    });
  });

  it("still requires a category for an expense on a credit card", async () => {
    prismaMock.providerImportedTransaction.findFirst.mockResolvedValue({
      id: "it-1",
      status: "pending",
      amount: new Prisma.Decimal("-10"),
      categoryId: null,
      providerAccount: { account: { type: "credit_card" } }
    } as never);
    assertImportedTransactionCategoryMock.mockResolvedValue(null);

    await expect(
      importProviderImportedTransaction({ id: "it-1", userId: "user-1" })
    ).rejects.toThrow("Category is required before importing");
  });

  describe("applied amounts", () => {
    function setupImport(rowCurrency: string, accountCurrency: string) {
      prismaMock.providerImportedTransaction.findFirst.mockResolvedValue({
        id: "it-1",
        status: "pending",
        amount: new Prisma.Decimal("-10"),
        categoryId: "cat-1",
        currency: rowCurrency,
        description: "Coffee",
        transactionDate: new Date(),
        providerAccount: { accountId: "acc-1", account: { currency: accountCurrency } }
      } as never);
      assertImportedTransactionCategoryMock.mockResolvedValue({ id: "cat-1" } as never);
      prismaMock.user.findUniqueOrThrow.mockResolvedValue({ preferredCurrency: null } as never);
      resolveTransactionCurrencyFieldsMock.mockResolvedValue({
        executionCurrency: rowCurrency,
        exchangeRate: 1,
        amountInPreferredCurrency: new Prisma.Decimal("10")
      });
      const tx = useImportTx([sourceRow("it-1", "-10", "Coffee", "acc-1")]);
      return tx;
    }

    it("copies the amount for the same currency", async () => {
      const tx = setupImport("USD", "USD");

      await importProviderImportedTransaction({ id: "it-1", userId: "user-1" });

      const data = createdData(tx) as Record<string, Prisma.Decimal>;
      expect(data.accountAmount?.toFixed()).toBe("10");
    });

    it("rejects a cross-currency import without accountAmount with a 400 naming it", async () => {
      const tx = setupImport("USD", "MXN");

      await expect(
        importProviderImportedTransaction({ id: "it-1", userId: "user-1" })
      ).rejects.toMatchObject({
        statusCode: 400,
        details: { issues: { fieldErrors: { accountAmount: expect.any(Array) } } }
      });
      expect(tx.transaction.createMany).not.toHaveBeenCalled();
    });

    it("persists the stated accountAmount for a cross-currency import", async () => {
      const tx = setupImport("USD", "MXN");

      await importProviderImportedTransaction({
        id: "it-1",
        userId: "user-1",
        accountAmount: "171.25"
      });

      const data = createdData(tx) as Record<string, Prisma.Decimal>;
      expect(data.accountAmount?.toFixed()).toBe("171.25");
    });
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
      amountInPreferredCurrency: new Prisma.Decimal("10")
    });

    const tx = useImportTx([sourceRow("it-1", "-10", "Coffee", "acc-1")]);

    const result = await importProviderImportedTransaction({
      id: "it-1",
      userId: "user-1"
    });

    expect(createdData(tx)).toMatchObject({ type: "expense", categoryId: "cat-1" });
    expect(tx.providerImportedTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["it-1"] }, userId: "user-1", status: "pending" },
      data: { status: "processed", errorMessage: null }
    });
    expect(tx.providerImportedTransaction.update).toHaveBeenCalledWith({
      where: { id: "it-1" },
      data: { categoryId: "cat-1", transactionId: createdData(tx).id }
    });
    expect(clearProviderPendingNotificationsMock).toHaveBeenCalled();
    expect(result.id).toBe("it-1");
  });
});

describe("batchImportProviderImportedTransactions", () => {
  beforeEach(() => {
    prismaMock.providerAccount.findMany.mockResolvedValue([]);
  });

  it("rejects a cross-currency row up front, importing nothing", async () => {
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      {
        id: "it-1",
        status: "pending",
        amount: new Prisma.Decimal("-1"),
        currency: "USD",
        categoryId: "cat-1",
        providerAccountRefId: "pa-1"
      }
    ] as never);
    prismaMock.providerAccount.findMany.mockResolvedValue([
      { id: "pa-1", account: { currency: "MXN" } }
    ] as never);

    await expect(
      batchImportProviderImportedTransactions("user-1", {
        selection: { mode: "ids", ids: ["it-1"] }
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      details: { errors: [{ id: "it-1", message: expect.stringContaining("import this row individually with accountAmount") }] }
    });
  });

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

  it("does not require a category for a positive row on a credit card", async () => {
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      {
        id: "it-1",
        status: "pending",
        amount: new Prisma.Decimal("50"),
        currency: "MXN",
        categoryId: null,
        providerAccountRefId: "pa-1"
      }
    ] as never);
    prismaMock.providerAccount.findMany.mockResolvedValue([
      { id: "pa-1", account: { currency: "MXN", type: "credit_card" } }
    ] as never);
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ preferredCurrency: null } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "MXN",
      exchangeRate: 1,
      amountInPreferredCurrency: new Prisma.Decimal("50")
    });
    const tx = useImportTx([sourceRow("it-1", "50")]);

    await expect(
      batchImportProviderImportedTransactions("user-1", { selection: { mode: "ids", ids: ["it-1"] } })
    ).resolves.toMatchObject({ importedCount: 1 });
    expect(createdData(tx)).toMatchObject({ categoryId: null });
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

  function pendingRow(id: string) {
    return {
      id,
      status: "pending",
      amount: new Prisma.Decimal("-1"),
      currency: "USD",
      categoryId: "cat-1",
      providerAccountRefId: null
    };
  }

  function setupBatch(ids: string[]) {
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue(ids.map(pendingRow) as never);
    assertImportedTransactionCategoryMock.mockResolvedValue({ id: "cat-1" } as never);
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ preferredCurrency: null } as never);
    resolveTransactionCurrencyFieldsMock.mockResolvedValue({
      executionCurrency: "USD",
      exchangeRate: 1,
      amountInPreferredCurrency: new Prisma.Decimal("1")
    });
  }

  it("creates every row inside one transaction with a modest explicit timeout", async () => {
    setupBatch(["it-1", "it-2", "it-3"]);
    const tx = useImportTx(["it-1", "it-2", "it-3"].map((id) => sourceRow(id)));

    const result = await batchImportProviderImportedTransactions("user-1", {
      selection: { mode: "ids", ids: ["it-1", "it-2", "it-3"] }
    });

    expect(result.importedCount).toBe(3);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 30_000 });
    expect(tx.transaction.createMany).toHaveBeenCalledTimes(1);
    expect(tx.transaction.createMany.mock.calls[0]?.[0].data).toHaveLength(3);
    expect(tx.providerImportedTransaction.updateMany).toHaveBeenCalledTimes(1);
    expect(clearProviderPendingNotificationsMock).toHaveBeenCalledTimes(1);
  });

  it("rejects the whole batch when row 2 of 3 fails to write, committing nothing", async () => {
    setupBatch(["it-1", "it-2", "it-3"]);
    const tx = useImportTx(["it-1", "it-2", "it-3"].map((id) => sourceRow(id)));
    tx.providerImportedTransaction.update
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("write failed"));

    await expect(
      batchImportProviderImportedTransactions("user-1", {
        selection: { mode: "ids", ids: ["it-1", "it-2", "it-3"] }
      })
    ).rejects.toThrow("write failed");

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.providerImportedTransaction.update).toHaveBeenCalledTimes(2);
    expect(clearProviderPendingNotificationsMock).not.toHaveBeenCalled();
  });

  it("rolls back with the 400 when a row was imported or ignored since validation", async () => {
    setupBatch(["it-1", "it-2"]);
    const tx = useImportTx(["it-1", "it-2"].map((id) => sourceRow(id)));
    tx.providerImportedTransaction.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      batchImportProviderImportedTransactions("user-1", {
        selection: { mode: "ids", ids: ["it-1", "it-2"] }
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.transaction.createMany).not.toHaveBeenCalled();
    expect(clearProviderPendingNotificationsMock).not.toHaveBeenCalled();
  });

  it("rejects a filtered selection above the cap with a 400 and writes nothing", async () => {
    vi.mocked(resolveImportedTransactionSelectionIds).mockResolvedValueOnce(
      Array.from({ length: 501 }, (_, i) => `it-${i}`)
    );

    await expect(
      batchImportProviderImportedTransactions("user-1", {
        selection: { mode: "filtered", where: undefined }
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
