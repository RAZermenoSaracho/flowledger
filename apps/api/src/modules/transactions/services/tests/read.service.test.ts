import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../utils/importedTransactionQuery.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../utils/importedTransactionQuery.js")
  >();
  return { ...actual, resolveImportedTransactionIds: vi.fn() };
});

const { resolveImportedTransactionIds } = await import(
  "../../utils/importedTransactionQuery.js"
);
const resolveImportedTransactionIdsMock = vi.mocked(resolveImportedTransactionIds);

const {
  getImportedTransactionsPendingCount,
  getTransactionById,
  getTransactionsSummary,
  listImportedTransactions,
  listTransactions
} = await import("../read.service.js");

describe("getTransactionById", () => {
  it("throws a 404 when not owned by the user", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue(null);

    await expect(getTransactionById("user-1", "txn-1")).rejects.toThrow(
      "Transaction not found"
    );
  });

  it("returns the transaction with its relations", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({ id: "txn-1" } as never);

    expect(await getTransactionById("user-1", "txn-1")).toMatchObject({
      id: "txn-1"
    });
  });
});

describe("getImportedTransactionsPendingCount", () => {
  it("counts pending imported transactions for the user", async () => {
    prismaMock.providerImportedTransaction.count.mockResolvedValue(4);

    expect(await getImportedTransactionsPendingCount("user-1")).toBe(4);
    expect(prismaMock.providerImportedTransaction.count).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "pending" }
    });
  });
});

describe("listImportedTransactions", () => {
  it("returns an empty list without a hydration query when no ids match", async () => {
    resolveImportedTransactionIdsMock.mockResolvedValue([]);
    prismaMock.providerImportedTransaction.count.mockResolvedValue(0);

    const result = await listImportedTransactions("user-1", undefined);

    expect(result).toEqual({ importedTransactions: [], total: 0, pendingCount: 0 });
    expect(prismaMock.providerImportedTransaction.findMany).not.toHaveBeenCalled();
  });

  it("hydrates and orders imported transactions to match the resolved id order", async () => {
    resolveImportedTransactionIdsMock.mockResolvedValue(["it-2", "it-1"]);
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      { id: "it-1" },
      { id: "it-2" }
    ] as never);
    prismaMock.providerImportedTransaction.count.mockResolvedValue(1);

    const result = await listImportedTransactions("user-1", undefined);

    expect(result.importedTransactions.map((row) => row.id)).toEqual([
      "it-2",
      "it-1"
    ]);
    expect(result.total).toBe(2);
  });

  it("drops an id from the ordered list if its row can't be found", async () => {
    resolveImportedTransactionIdsMock.mockResolvedValue(["it-1", "it-missing"]);
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      { id: "it-1" }
    ] as never);
    prismaMock.providerImportedTransaction.count.mockResolvedValue(0);

    const result = await listImportedTransactions("user-1", undefined);

    expect(result.importedTransactions).toEqual([{ id: "it-1" }]);
  });
});

describe("listTransactions — query param handling", () => {
  it("scopes to the user with no query param", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([]);
    prismaMock.transaction.count.mockResolvedValue(0);

    await listTransactions("user-1", undefined);

    const call = prismaMock.transaction.findMany.mock.calls[0]?.[0] as {
      where: unknown;
    };
    expect(JSON.stringify(call.where)).toContain("user-1");
  });

  it("rejects invalid JSON", async () => {
    await expect(listTransactions("user-1", "not json")).rejects.toThrow(
      "Invalid transactions query: not valid JSON"
    );
  });
});

describe("listTransactions — 'classification' virtual field", () => {
  it("rewrites 'complete' into requiring account+category (or both transfer accounts)", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([]);
    prismaMock.transaction.count.mockResolvedValue(0);

    await listTransactions(
      "user-1",
      JSON.stringify({
        where: { field: "classification", op: "=", value: "complete" }
      })
    );

    const call = prismaMock.transaction.findMany.mock.calls[0]?.[0] as {
      where: unknown;
    };
    expect(JSON.stringify(call.where)).toContain("accountId");
  });

  it("rewrites 'needsClassification' the same way", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([]);
    prismaMock.transaction.count.mockResolvedValue(0);

    await listTransactions(
      "user-1",
      JSON.stringify({
        where: { field: "classification", op: "=", value: "needsClassification" }
      })
    );

    const call = prismaMock.transaction.findMany.mock.calls[0]?.[0] as {
      where: unknown;
    };
    expect(JSON.stringify(call.where)).toContain("accountId");
  });
});

describe("listTransactions — 'transactionFilterType' virtual field", () => {
  it("rewrites 'expenseOffset' into an expenseOffsetCategoryId isNotNull condition", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([]);
    prismaMock.transaction.count.mockResolvedValue(0);

    await listTransactions(
      "user-1",
      JSON.stringify({
        where: { field: "transactionFilterType", op: "=", value: "expenseOffset" }
      })
    );

    const call = prismaMock.transaction.findMany.mock.calls[0]?.[0] as {
      where: unknown;
    };
    expect(JSON.stringify(call.where)).toContain("expenseOffsetCategoryId");
  });

  it("rewrites 'settlement' into an id-in condition resolved via a raw settlement lookup", async () => {
    prismaMock.transaction.findMany
      .mockResolvedValueOnce([{ id: "settle-1" }] as never) // settlement id lookup
      .mockResolvedValueOnce([] as never); // main query result
    prismaMock.transaction.count.mockResolvedValue(0);

    await listTransactions(
      "user-1",
      JSON.stringify({
        where: { field: "transactionFilterType", op: "=", value: "settlement" }
      })
    );

    expect(prismaMock.transaction.findMany).toHaveBeenCalledTimes(2);
  });
});

describe("getTransactionsSummary", () => {
  it("computes income/expenses/balance from the grouped aggregation", async () => {
    prismaMock.transaction.groupBy.mockResolvedValue([
      { type: "income", total: "1000" },
      { type: "expense", total: "400" }
    ] as never);

    const result = await getTransactionsSummary("user-1", undefined);

    expect(result).toEqual({ income: 1000, expenses: 400, balance: 600 });
  });

  it("defaults missing income/expense buckets to 0", async () => {
    prismaMock.transaction.groupBy.mockResolvedValue([] as never);

    expect(await getTransactionsSummary("user-1", undefined)).toEqual({
      income: 0,
      expenses: 0,
      balance: 0
    });
  });
});
