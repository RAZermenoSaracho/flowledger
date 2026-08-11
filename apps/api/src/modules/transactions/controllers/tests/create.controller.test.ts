import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/create.service.js", () => ({
  batchImportProviderImportedTransactions: vi.fn(),
  createTransaction: vi.fn(),
  importProviderImportedTransaction: vi.fn()
}));

const {
  batchImportProviderImportedTransactions,
  createTransaction,
  importProviderImportedTransaction
} = await import("../../services/create.service.js");
const { postBatchImport, postImportedTransactionImport, postTransaction } =
  await import("../create.controller.js");

describe("postTransaction", () => {
  it("creates the transaction and responds 201", async () => {
    vi.mocked(createTransaction).mockResolvedValue({ id: "txn-1" } as never);
    const res = mockResponse();

    await postTransaction(mockRequest({ body: { name: "Coffee" } }), res);

    expect(createTransaction).toHaveBeenCalledWith("user-1", { name: "Coffee" });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("postImportedTransactionImport", () => {
  it("imports the pending row and responds 201", async () => {
    vi.mocked(importProviderImportedTransaction).mockResolvedValue({
      id: "it-1"
    } as never);
    const res = mockResponse();

    await postImportedTransactionImport(
      mockRequest({ params: { id: "it-1" }, body: { categoryId: "cat-1" } }),
      res
    );

    expect(importProviderImportedTransaction).toHaveBeenCalledWith({
      id: "it-1",
      userId: "user-1",
      categoryId: "cat-1"
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("throws a 404 with no id param", async () => {
    await expect(
      postImportedTransactionImport(mockRequest({ params: {} }), mockResponse())
    ).rejects.toThrow("Imported transaction not found");
  });
});

describe("postBatchImport", () => {
  it("imports the selection and responds 201", async () => {
    vi.mocked(batchImportProviderImportedTransactions).mockResolvedValue({
      importedTransactions: [],
      importedCount: 0,
      errors: []
    } as never);
    const res = mockResponse();

    await postBatchImport(
      mockRequest({ body: { selection: { mode: "ids", ids: ["it-1"] } } }),
      res
    );

    expect(batchImportProviderImportedTransactions).toHaveBeenCalledWith("user-1", {
      selection: { mode: "ids", ids: ["it-1"] },
      categoryId: undefined
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
