import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

/**
 * `transaction.groupBy` is Prisma's most heavily overloaded generic method —
 * `vitest-mock-extended`'s typing can't express `.mockResolvedValue(...)` on
 * it directly, so this narrows it to a plain mock-like shape for test use.
 */
interface GroupByMock {
  mockResolvedValue: (value: unknown) => GroupByMock;
  mockResolvedValueOnce: (value: unknown) => GroupByMock;
}
const groupByMock = prismaMock.transaction.groupBy as unknown as GroupByMock;

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

  it("includes only the provider transactionDate of the linked import", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({ id: "txn-1" } as never);
    prismaMock.settlementRequest.findMany.mockResolvedValue([]);

    await getTransactionById("user-1", "txn-1");

    const call = prismaMock.transaction.findFirst.mock.calls[0]?.[0] as {
      include: Record<string, unknown>;
    };
    expect(call.include.providerImportedTransaction).toEqual({
      select: { transactionDate: true }
    });
  });

  it("returns the transaction with its relations", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({ id: "txn-1" } as never);
    prismaMock.settlementRequest.findMany.mockResolvedValue([]);

    expect(await getTransactionById("user-1", "txn-1")).toMatchObject({
      id: "txn-1"
    });
  });
});

describe("getTransactionById related transactions", () => {
  const tx = (id: string, userId: string) => ({
    id, userId, name: `T ${id}`, amount: 10, executionCurrency: "USD", type: "expense", date: new Date("2026-01-01")
  });
  const expenseOf = (ownerTx: ReturnType<typeof tx>) => ({
    transactionId: ownerTx.id,
    title: "Dinner",
    totalAmount: 30,
    transaction: ownerTx,
    owner: { id: "a", username: "alice", nickname: null, name: "Alice", identityVisibility: "username_only" }
  });
  const user = (id: string, username: string) => ({ id, username, nickname: null, name: username, identityVisibility: "username_only" });
  const request = (over: Record<string, unknown>) => ({
    id: "req-1",
    status: "approved",
    amount: 30,
    createdAt: new Date("2026-01-02"),
    approvedAt: new Date("2026-01-03"),
    sharedExpenseParticipantId: "part-1",
    debtorUserId: "b",
    creditorUserId: "a",
    debtor: user("b", "bob"),
    creditor: user("a", "alice"),
    debtorTransaction: tx("deb-b", "b"),
    creditorTransaction: tx("cred-a", "a"),
    ...over
  });

  it("never loads TransactionRelation rows and scopes the settlement query to the caller", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({ id: "o" } as never);
    prismaMock.settlementRequest.findMany.mockResolvedValue([]);

    const result = await getTransactionById("a", "o");

    const include = (prismaMock.transaction.findFirst.mock.calls[0]?.[0] as { include: object }).include;
    expect(include).not.toHaveProperty("relations");
    expect(include).not.toHaveProperty("relatedBy");
    expect(JSON.stringify(prismaMock.settlementRequest.findMany.mock.calls[0]?.[0])).toContain('"ownerUserId":"a"');
    expect(result).toMatchObject({ relatedTransactions: [], relatedSettlements: [], settlementOrigin: null });
  });

  it("lists every request of an original, pending ones included, with the counterparty and only the viewer's own transaction", async () => {
    const original = tx("o", "a");
    prismaMock.transaction.findFirst.mockResolvedValue({ id: "o" } as never);
    prismaMock.settlementRequest.findMany.mockResolvedValue([
      request({ sharedExpenseParticipant: { sharedExpense: expenseOf(original) } }),
      request({
        id: "req-2",
        status: "pending",
        approvedAt: null,
        creditorTransaction: null,
        debtorTransaction: null,
        debtorUserId: "c",
        debtor: user("c", "carol"),
        sharedExpenseParticipantId: "part-2",
        sharedExpenseParticipant: { sharedExpense: expenseOf(original) }
      })
    ] as never);

    const result = await getTransactionById("a", "o");

    expect(result.relatedTransactions).toEqual([]);
    expect(result.settlementOrigin).toBeNull();
    expect(result.relatedSettlements).toEqual([
      expect.objectContaining({
        id: "req-1",
        status: "approved",
        amount: 30,
        participantId: "part-1",
        counterparty: { id: "b", username: "bob", nickname: null, displayName: null },
        transaction: { id: "cred-a", description: "T cred-a", date: new Date("2026-01-01"), type: "expense" }
      }),
      expect.objectContaining({
        id: "req-2",
        status: "pending",
        approvedAt: null,
        counterparty: { id: "c", username: "carol", nickname: null, displayName: null },
        transaction: null
      })
    ]);
    expect(JSON.stringify(result.relatedSettlements)).not.toContain("deb-b");
  });

  it("lists the original as a navigable origin row and no settlements when the viewer owns it", async () => {
    const original = tx("o", "a");
    prismaMock.transaction.findFirst.mockResolvedValue({ id: "cred-a" } as never);
    prismaMock.settlementRequest.findMany.mockResolvedValue([
      request({ sharedExpenseParticipant: { sharedExpense: expenseOf(original) } })
    ] as never);

    const result = await getTransactionById("a", "cred-a");

    expect(result.relatedTransactions.map((row) => [row.id, row.relation])).toEqual([["o", "origin"]]);
    expect(result.relatedSettlements).toEqual([]);
  });

  it("gives a participant only a non-navigable origin summary without ids or owner-private data", async () => {
    const original = { ...tx("o", "a"), accountId: "acc-secret", notes: "secret" };
    prismaMock.transaction.findFirst.mockResolvedValue({ id: "deb-b" } as never);
    prismaMock.settlementRequest.findMany.mockResolvedValue([
      request({ sharedExpenseParticipant: { sharedExpense: expenseOf(original) } })
    ] as never);

    const result = await getTransactionById("b", "deb-b");

    expect(result.relatedTransactions).toEqual([]);
    expect(result.relatedSettlements).toEqual([]);
    expect(result.settlementOrigin).toEqual({
      title: "Dinner",
      amount: 30,
      currency: "USD",
      date: original.date,
      type: "expense",
      owner: { id: "a", username: "alice", nickname: null, displayName: null }
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain("cred-a");
    expect(json).not.toContain("acc-secret");
    expect(json).not.toContain('"o"');
  });
});

describe("getTransactionById participants", () => {
  beforeEach(() => {
    prismaMock.settlementRequest.findMany.mockResolvedValue([]);
  });

  it("loads only public user columns and returns the live label instead of a stored real name", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({
      id: "txn-1",
      sharedExpense: {
        participants: [
          {
            participantName: "Real Name",
            user: { id: "u2", username: "friend", name: "Real Name", identityVisibility: "username_only" }
          }
        ]
      }
    } as never);

    const result = await getTransactionById("user-1", "txn-1");

    const call = prismaMock.transaction.findFirst.mock.calls[0]?.[0] as {
      include: { sharedExpense: { include: { participants: { include: { user: { select: object } } } } } };
    };
    expect(call.include.sharedExpense.include.participants.include.user.select).toEqual({
      id: true,
      username: true,
      nickname: true,
      name: true,
      identityVisibility: true
    });
    expect(result.sharedExpense?.participants[0]?.participantName).toBe("@friend");
    expect(JSON.stringify(result)).not.toContain("Real Name");
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
    resolveImportedTransactionIdsMock.mockResolvedValue({ ids: [], total: 0 });
    prismaMock.providerImportedTransaction.count.mockResolvedValue(0);

    const result = await listImportedTransactions("user-1", undefined);

    expect(result).toEqual({ importedTransactions: [], total: 0, pendingCount: 0 });
    expect(prismaMock.providerImportedTransaction.findMany).not.toHaveBeenCalled();
  });

  it("hydrates and orders imported transactions to match the resolved id order", async () => {
    resolveImportedTransactionIdsMock.mockResolvedValue({ ids: ["it-2", "it-1"], total: 2 });
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
    resolveImportedTransactionIdsMock.mockResolvedValue({ ids: ["it-1", "it-missing"], total: 2 });
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      { id: "it-1" }
    ] as never);
    prismaMock.providerImportedTransaction.count.mockResolvedValue(0);

    const result = await listImportedTransactions("user-1", undefined);

    expect(result.importedTransactions).toEqual([{ id: "it-1" }]);
  });
});

describe("listImportedTransactions — pagination", () => {
  it("forwards pagination and reports the resolver's full total for a page", async () => {
    const pagination = { kind: "offset", page: 2, pageSize: 1 };
    resolveImportedTransactionIdsMock.mockResolvedValue({ ids: ["it-2"], total: 7 });
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([{ id: "it-2" }] as never);
    prismaMock.providerImportedTransaction.count.mockResolvedValue(3);

    const result = await listImportedTransactions(
      "user-1",
      JSON.stringify({ pagination })
    );

    expect(resolveImportedTransactionIdsMock).toHaveBeenCalledWith(
      "user-1",
      undefined,
      expect.anything(),
      pagination
    );
    expect(result).toMatchObject({ total: 7, pendingCount: 3 });
    expect(result.importedTransactions).toHaveLength(1);
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

  it("includes only the provider transactionDate of each linked import", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([]);
    prismaMock.transaction.count.mockResolvedValue(0);

    await listTransactions("user-1", undefined);

    const call = prismaMock.transaction.findMany.mock.calls[0]?.[0] as {
      include: Record<string, unknown>;
    };
    expect(call.include.providerImportedTransaction).toEqual({
      select: { transactionDate: true }
    });
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
    groupByMock.mockResolvedValue([
      { type: "income", total: "1000" },
      { type: "expense", total: "400" }
    ] as never);

    const result = await getTransactionsSummary("user-1", undefined);

    expect(result).toEqual({ income: 1000, expenses: 400, balance: 600 });
  });

  it("defaults missing income/expense buckets to 0", async () => {
    groupByMock.mockResolvedValue([] as never);

    expect(await getTransactionsSummary("user-1", undefined)).toEqual({
      income: 0,
      expenses: 0,
      balance: 0
    });
  });
});
