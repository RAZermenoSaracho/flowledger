import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../../utils/httpError.js";
import type { McpAuth } from "../../types/mcp.types.js";

vi.mock("../../../transactions/services/create.service.js", () => ({
  batchImportProviderImportedTransactions: vi.fn()
}));
vi.mock("../../../transactions/services/update.service.js", () => ({
  batchIgnoreImportedTransactions: vi.fn(),
  batchUnignoreImportedTransactions: vi.fn(),
  updateImportedTransactionCategory: vi.fn()
}));
vi.mock("../../../../utils/auditLog.js", () => ({ auditLog: vi.fn() }));

const { batchImportProviderImportedTransactions } = await import("../../../transactions/services/create.service.js");
const { batchIgnoreImportedTransactions, batchUnignoreImportedTransactions, updateImportedTransactionCategory } =
  await import("../../../transactions/services/update.service.js");
const { auditLog } = await import("../../../../utils/auditLog.js");
const { registerImportedWriteTools } = await import("../tools.imports.controller.js");

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; structuredContent?: unknown }>;

function register(scopes: string[]) {
  const auth = { token: "t", clientId: "k1", scopes, extra: { userId: "u1", kind: "apiKey" } } as McpAuth;
  const tools = new Map<string, { config: Record<string, any>; handler: Handler }>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  registerImportedWriteTools(
    { registerTool: (n: string, config: Record<string, unknown>, handler: Handler) => tools.set(n, { config, handler }) } as never,
    auth
  );
  return tools;
}
const write = register(["read", "write"]);
const run = (name: string, args: Record<string, unknown>) => write.get(name)!.handler(args);

beforeEach(() => vi.clearAllMocks());

describe("registerImportedWriteTools", () => {
  it("registers four tools; import asks for explicit confirmation", () => {
    expect([...write.keys()]).toEqual([
      "update_imported_transaction",
      "ignore_imported_transactions",
      "unignore_imported_transactions",
      "import_imported_transactions"
    ]);
    expect(write.get("import_imported_transactions")!.config.description).toMatch(/explicit user confirmation/);
  });

  it("update_imported_transaction calls the category service for the user and audits 200", async () => {
    vi.mocked(updateImportedTransactionCategory).mockResolvedValue({ id: "i1" } as never);
    const result = await run("update_imported_transaction", { id: "i1", categoryId: null });

    expect(updateImportedTransactionCategory).toHaveBeenCalledWith("u1", "i1", { categoryId: null });
    expect(result.structuredContent).toEqual({ importedTransaction: { id: "i1" } });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "mcp.update_imported_transaction", resourceId: "i1", status: 200 }));
  });

  it.each([
    ["ignore_imported_transactions", batchIgnoreImportedTransactions, "ignoredCount"],
    ["unignore_imported_transactions", batchUnignoreImportedTransactions, "unignoredCount"]
  ])("%s runs the batch service in ids mode", async (tool, service, key) => {
    vi.mocked(service).mockResolvedValue(2 as never);
    const result = await run(tool, { ids: ["a", "b"] });

    expect(service).toHaveBeenCalledWith("u1", { mode: "ids", ids: ["a", "b"] });
    expect(result.structuredContent).toEqual({ [key]: 2, errors: [] });
  });

  it("import_imported_transactions passes ids mode and the category, audits 201", async () => {
    vi.mocked(batchImportProviderImportedTransactions).mockResolvedValue({
      importedTransactions: [],
      importedCount: 0,
      errors: []
    } as never);
    await run("import_imported_transactions", { ids: ["a"], categoryId: "c1" });

    expect(batchImportProviderImportedTransactions).toHaveBeenCalledWith("u1", {
      selection: { mode: "ids", ids: ["a"] },
      categoryId: "c1"
    });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "mcp.import_imported_transactions", status: 201 }));
  });

  it.each([
    ["ignore_imported_transactions", { ids: [] }],
    ["unignore_imported_transactions", { ids: Array.from({ length: 51 }, (_, i) => String(i)) }],
    ["import_imported_transactions", { ids: ["a"], selection: { mode: "filtered" } }]
  ])("%s rejects bad input without calling a service", async (tool, args) => {
    const result = await run(tool, args);

    expect(result.isError).toBe(true);
    expect(batchIgnoreImportedTransactions).not.toHaveBeenCalled();
    expect(batchUnignoreImportedTransactions).not.toHaveBeenCalled();
    expect(batchImportProviderImportedTransactions).not.toHaveBeenCalled();
  });

  it("maps a domain failure to isError and audits its status", async () => {
    vi.mocked(batchIgnoreImportedTransactions).mockRejectedValue(new HttpError(400, "nope"));
    expect((await run("ignore_imported_transactions", { ids: ["a"] })).isError).toBe(true);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it("refuses without the write scope", async () => {
    const readOnly = register(["read"]);
    const result = await readOnly.get("ignore_imported_transactions")!.handler({ ids: ["a"] });

    expect(result.isError).toBe(true);
    expect(batchIgnoreImportedTransactions).not.toHaveBeenCalled();
  });
});
