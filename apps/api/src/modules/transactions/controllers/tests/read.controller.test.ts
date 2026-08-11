import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  getImportedTransactionsPendingCount: vi.fn(),
  getTransactionById: vi.fn(),
  getTransactionsSummary: vi.fn(),
  listImportedTransactions: vi.fn(),
  listTransactions: vi.fn()
}));

const {
  getImportedTransactionsPendingCount,
  getTransactionById,
  getTransactionsSummary,
  listImportedTransactions,
  listTransactions
} = await import("../../services/read.service.js");
const {
  getImportedTransactions,
  getImportedTransactionsPendingCountHandler,
  getTransaction,
  getTransactions,
  getTransactionsSummaryHandler
} = await import("../read.controller.js");

describe("getImportedTransactions", () => {
  it("returns imported transactions with total/pending counts", async () => {
    vi.mocked(listImportedTransactions).mockResolvedValue({
      importedTransactions: [{ id: "it-1" }],
      total: 1,
      pendingCount: 1
    } as never);
    const res = mockResponse();

    await getImportedTransactions(mockRequest({ query: { query: "{}" } }), res);

    expect(listImportedTransactions).toHaveBeenCalledWith("user-1", "{}");
    expect(res.json).toHaveBeenCalledWith({
      importedTransactions: [{ id: "it-1" }],
      total: 1,
      pendingCount: 1
    });
  });
});

describe("getImportedTransactionsPendingCountHandler", () => {
  it("returns the pending count", async () => {
    vi.mocked(getImportedTransactionsPendingCount).mockResolvedValue(2);
    const res = mockResponse();

    await getImportedTransactionsPendingCountHandler(mockRequest(), res);

    expect(res.json).toHaveBeenCalledWith({ count: 2 });
  });
});

describe("getTransactions", () => {
  // listTransactions() returns the sieve's own {data, total}/{data, nextCursor,
  // previousCursor} shape, which never has a `meta` key — this controller's
  // `result.meta` is currently always undefined (and so omitted from the
  // response by JSON.stringify). Flagged to the user; asserting current
  // actual behavior here rather than the shape the frontend's type
  // (DataSieveMeta) implies it should be.
  it("returns transaction data (meta is currently always undefined)", async () => {
    vi.mocked(listTransactions).mockResolvedValue({
      data: [{ id: "txn-1" }],
      total: 1
    } as never);
    const res = mockResponse();

    await getTransactions(mockRequest({ query: { query: "{}" } }), res);

    expect(listTransactions).toHaveBeenCalledWith("user-1", "{}");
    expect(res.json).toHaveBeenCalledWith({
      data: [{ id: "txn-1" }],
      meta: undefined
    });
  });
});

describe("getTransactionsSummaryHandler", () => {
  it("returns the income/expense/balance summary", async () => {
    vi.mocked(getTransactionsSummary).mockResolvedValue({
      income: 100,
      expenses: 40,
      balance: 60
    });
    const res = mockResponse();

    await getTransactionsSummaryHandler(mockRequest({ query: { query: "{}" } }), res);

    expect(res.json).toHaveBeenCalledWith({ income: 100, expenses: 40, balance: 60 });
  });
});

describe("getTransaction", () => {
  it("returns one transaction by id", async () => {
    vi.mocked(getTransactionById).mockResolvedValue({ id: "txn-1" } as never);
    const res = mockResponse();

    await getTransaction(mockRequest({ params: { id: "txn-1" } }), res);

    expect(getTransactionById).toHaveBeenCalledWith("user-1", "txn-1");
  });
});
