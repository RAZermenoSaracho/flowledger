import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/update.service.js", () => ({
  batchIgnoreImportedTransactions: vi.fn(),
  batchUnignoreImportedTransactions: vi.fn(),
  ignoreImportedTransaction: vi.fn(),
  unignoreImportedTransaction: vi.fn(),
  updateImportedTransactionCategory: vi.fn(),
  updateTransaction: vi.fn()
}));

const {
  batchIgnoreImportedTransactions,
  batchUnignoreImportedTransactions,
  ignoreImportedTransaction,
  unignoreImportedTransaction,
  updateImportedTransactionCategory,
  updateTransaction
} = await import("../../services/update.service.js");
const {
  patchImportedTransaction,
  postBatchIgnore,
  postBatchUnignore,
  postIgnoreImportedTransaction,
  postUnignoreImportedTransaction,
  putTransaction
} = await import("../update.controller.js");

describe("patchImportedTransaction", () => {
  it("updates the category", async () => {
    vi.mocked(updateImportedTransactionCategory).mockResolvedValue({
      id: "it-1"
    } as never);
    const res = mockResponse();

    await patchImportedTransaction(
      mockRequest({ params: { id: "it-1" }, body: { categoryId: "cat-1" } }),
      res
    );

    expect(updateImportedTransactionCategory).toHaveBeenCalledWith(
      "user-1",
      "it-1",
      { categoryId: "cat-1" }
    );
  });

  it("throws a 404 with no id param", async () => {
    await expect(
      patchImportedTransaction(mockRequest({ params: {} }), mockResponse())
    ).rejects.toThrow("Imported transaction not found");
  });
});

describe("postIgnoreImportedTransaction", () => {
  it("marks the row ignored", async () => {
    vi.mocked(ignoreImportedTransaction).mockResolvedValue({ id: "it-1" } as never);
    const res = mockResponse();

    await postIgnoreImportedTransaction(mockRequest({ params: { id: "it-1" } }), res);

    expect(ignoreImportedTransaction).toHaveBeenCalledWith("user-1", "it-1");
  });
});

describe("postUnignoreImportedTransaction", () => {
  it("reverts the row to pending", async () => {
    vi.mocked(unignoreImportedTransaction).mockResolvedValue({ id: "it-1" } as never);
    const res = mockResponse();

    await postUnignoreImportedTransaction(
      mockRequest({ params: { id: "it-1" } }),
      res
    );

    expect(unignoreImportedTransaction).toHaveBeenCalledWith("user-1", "it-1");
  });
});

describe("postBatchIgnore", () => {
  it("ignores the selection", async () => {
    vi.mocked(batchIgnoreImportedTransactions).mockResolvedValue(2);
    const res = mockResponse();

    await postBatchIgnore(
      mockRequest({ body: { selection: { mode: "ids", ids: ["it-1"] } } }),
      res
    );

    expect(res.json).toHaveBeenCalledWith({ ignoredCount: 2, errors: [] });
  });
});

describe("postBatchUnignore", () => {
  it("unignores the selection", async () => {
    vi.mocked(batchUnignoreImportedTransactions).mockResolvedValue(1);
    const res = mockResponse();

    await postBatchUnignore(
      mockRequest({ body: { selection: { mode: "ids", ids: ["it-1"] } } }),
      res
    );

    expect(res.json).toHaveBeenCalledWith({ unignoredCount: 1, errors: [] });
  });
});

describe("putTransaction", () => {
  it("updates the transaction", async () => {
    vi.mocked(updateTransaction).mockResolvedValue({ id: "txn-1" } as never);
    const res = mockResponse();

    await putTransaction(
      mockRequest({ params: { id: "txn-1" }, body: { amount: 50 } }),
      res
    );

    expect(updateTransaction).toHaveBeenCalledWith("user-1", "txn-1", {
      amount: 50
    });
  });
});
