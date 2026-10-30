import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../../utils/httpError.js";
import type { McpAuth } from "../../types/mcp.types.js";

vi.mock("../../../accounts/services/create.service.js", () => ({ createAccount: vi.fn() }));
vi.mock("../../../accounts/services/delete.service.js", () => ({ deleteAccount: vi.fn() }));
vi.mock("../../../categories/services/delete.service.js", () => ({ deleteCategory: vi.fn() }));
vi.mock("../../../accounts/services/update.service.js", () => ({
  updateAccount: vi.fn(),
  archiveAccount: vi.fn(),
  restoreAccount: vi.fn()
}));
vi.mock("../../../categories/services/create.service.js", () => ({ createCategory: vi.fn() }));
vi.mock("../../../categories/services/update.service.js", () => ({
  updateCategory: vi.fn(),
  archiveCategory: vi.fn(),
  restoreCategory: vi.fn()
}));
vi.mock("../../../transactions/services/delete.service.js", () => ({ deleteTransaction: vi.fn() }));
vi.mock("../../../../utils/auditLog.js", () => ({ auditLog: vi.fn() }));

const { createAccount } = await import("../../../accounts/services/create.service.js");
const { updateAccount, archiveAccount, restoreAccount } = await import("../../../accounts/services/update.service.js");
const { createCategory } = await import("../../../categories/services/create.service.js");
const { updateCategory, archiveCategory, restoreCategory } = await import("../../../categories/services/update.service.js");
const { deleteAccount } = await import("../../../accounts/services/delete.service.js");
const { deleteCategory } = await import("../../../categories/services/delete.service.js");
const { deleteTransaction } = await import("../../../transactions/services/delete.service.js");
const { auditLog } = await import("../../../../utils/auditLog.js");
const { registerPersonalWriteTools } = await import("../tools.writes.controller.js");

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; structuredContent?: unknown }>;

function register(scopes: string[]) {
  const auth = { token: "t", clientId: "k1", scopes, extra: { userId: "u1", kind: "apiKey" } } as McpAuth;
  const tools = new Map<string, { config: Record<string, any>; handler: Handler }>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  registerPersonalWriteTools(
    { registerTool: (n: string, config: Record<string, unknown>, handler: Handler) => tools.set(n, { config, handler }) } as never,
    auth
  );
  return tools;
}
const write = register(["read", "write"]);
const run = (name: string, args: Record<string, unknown>) => write.get(name)!.handler(args);

beforeEach(() => vi.clearAllMocks());

describe("registerPersonalWriteTools", () => {
  it("registers nine tools with the annotations from the spec", () => {
    expect([...write.keys()]).toEqual([
      "create_account",
      "update_account",
      "set_account_archived",
      "create_category",
      "update_category",
      "set_category_archived",
      "delete_account",
      "delete_category",
      "delete_transaction"
    ]);
    for (const name of ["delete_account", "delete_category"]) {
      expect(write.get(name)!.config.annotations).toEqual({ destructiveHint: true, idempotentHint: false });
      expect(write.get(name)!.config.description).toMatch(/explicit user confirmation/);
    }
    expect(write.get("delete_transaction")!.config.annotations).toEqual({
      destructiveHint: true,
      idempotentHint: false
    });
    expect(write.get("delete_transaction")!.config.description).toMatch(/shared expense/);
    expect(write.get("set_account_archived")!.config.annotations).toEqual({ idempotentHint: true });
    expect(write.get("set_category_archived")!.config.annotations).toEqual({ idempotentHint: true });
  });

  it("create_account parses with the shared schema, creates for the user and audits 201", async () => {
    vi.mocked(createAccount).mockResolvedValue({ id: "a1" } as never);
    await run("create_account", { name: "Main", type: "checking", userId: "evil" });

    expect(createAccount).toHaveBeenCalledWith("u1", { name: "Main", type: "checking", currency: "USD", initialBalance: 0 });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "mcp.create_account", resourceId: "a1", status: 201 }));
  });

  it("update_account strips unknown keys such as userId and isArchived", async () => {
    vi.mocked(updateAccount).mockResolvedValue({ id: "a1" } as never);
    await run("update_account", { id: "a1", name: "New", userId: "evil", isArchived: true });

    expect(updateAccount).toHaveBeenCalledWith("u1", "a1", { name: "New" });
  });

  it.each([
    [true, archiveAccount, restoreAccount],
    [false, restoreAccount, archiveAccount]
  ])("set_account_archived archived=%s calls only the matching service", async (archived, used, unused) => {
    vi.mocked(used).mockResolvedValue({ id: "a1" } as never);
    await run("set_account_archived", { id: "a1", archived });

    expect(used).toHaveBeenCalledWith("u1", "a1");
    expect(unused).not.toHaveBeenCalled();
  });

  it("create_category rejects an invalid type, creates nothing and audits 400", async () => {
    const result = await run("create_category", { name: "X", type: "bogus" });

    expect(result.isError).toBe(true);
    expect(createCategory).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it("create_category and update_category call their services", async () => {
    vi.mocked(createCategory).mockResolvedValue({ id: "c1" } as never);
    vi.mocked(updateCategory).mockResolvedValue({ id: "c1" } as never);
    await run("create_category", { name: "Food", type: "expense" });
    await run("update_category", { id: "c1", color: "#fff" });

    expect(createCategory).toHaveBeenCalledWith("u1", { name: "Food", type: "expense" });
    expect(updateCategory).toHaveBeenCalledWith("u1", "c1", { color: "#fff" });
  });

  it("update_category with no fields is rejected by the shared at-least-one-field rule", async () => {
    expect((await run("update_category", { id: "c1" })).isError).toBe(true);
    expect(updateCategory).not.toHaveBeenCalled();
  });

  it.each([
    [true, archiveCategory, restoreCategory],
    [false, restoreCategory, archiveCategory]
  ])("set_category_archived archived=%s calls only the matching service", async (archived, used, unused) => {
    vi.mocked(used).mockResolvedValue({ id: "c1" } as never);
    await run("set_category_archived", { id: "c1", archived });

    expect(used).toHaveBeenCalledWith("u1", "c1");
    expect(unused).not.toHaveBeenCalled();
  });

  it.each([
    ["delete_account", deleteAccount],
    ["delete_category", deleteCategory]
  ])("%s calls its service for the user, returns { deleted, id } and audits once", async (tool, service) => {
    vi.mocked(service).mockResolvedValue(undefined as never);
    const result = await run(tool, { id: "r1" });

    expect(result.isError).toBeUndefined();
    expect(service).toHaveBeenCalledWith("u1", "r1");
    expect(result.structuredContent).toEqual({ deleted: true, id: "r1" });
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it("delete_account surfaces the service HttpError message as an MCP error and audits its status", async () => {
    vi.mocked(deleteAccount).mockRejectedValue(new HttpError(404, "Account not found"));
    const result = await run("delete_account", { id: "x" });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("Account not found");
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "mcp.delete_account", status: 404, resourceId: "x" }));
  });

  it("delete_transaction deletes and returns { deleted, id }", async () => {
    vi.mocked(deleteTransaction).mockResolvedValue(undefined as never);
    const result = await run("delete_transaction", { id: "t1" });

    expect(deleteTransaction).toHaveBeenCalledWith("u1", "t1");
    expect(result.structuredContent).toEqual({ deleted: true, id: "t1" });
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it("delete_transaction for a foreign id surfaces 404 and audits the requested id", async () => {
    vi.mocked(deleteTransaction).mockRejectedValue(new HttpError(404, "Transaction not found"));
    const result = await run("delete_transaction", { id: "x" });

    expect(result.isError).toBe(true);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ status: 404, resourceId: "x" }));
  });

  it("refuses every tool without the write scope and calls no service", async () => {
    const auth = { token: "t", clientId: "k1", scopes: ["write"], extra: { userId: "u1", kind: "apiKey" } } as McpAuth;
    const tools = new Map<string, Handler>();
    registerPersonalWriteTools({ registerTool: (n: string, _c: unknown, h: Handler) => tools.set(n, h) } as never, auth);
    auth.scopes = ["read"];

    for (const handler of tools.values()) expect((await handler({ id: "x", name: "n", type: "expense", archived: true })).isError).toBe(true);
    expect(deleteTransaction).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(deleteCategory).not.toHaveBeenCalled();
    expect(createAccount).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledTimes(9);
  });
});
