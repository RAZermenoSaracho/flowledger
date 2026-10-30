import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../../utils/httpError.js";
import type { McpAuth } from "../../types/mcp.types.js";

vi.mock("../../../accounts/services/read.service.js", () => ({ listAccounts: vi.fn() }));
vi.mock("../../../categories/services/read.service.js", () => ({ listCategories: vi.fn() }));
vi.mock("../../../transactions/services/read.service.js", () => ({
  listTransactions: vi.fn(),
  getTransactionsSummary: vi.fn()
}));
vi.mock("../../../transactions/services/create.service.js", () => ({ createTransaction: vi.fn() }));
vi.mock("../../../transactions/services/update.service.js", () => ({ updateTransaction: vi.fn() }));
vi.mock("../../../../utils/auditLog.js", () => ({ auditLog: vi.fn() }));

const { listAccounts } = await import("../../../accounts/services/read.service.js");
const { listCategories } = await import("../../../categories/services/read.service.js");
const { listTransactions, getTransactionsSummary } = await import(
  "../../../transactions/services/read.service.js"
);
const { createTransaction } = await import("../../../transactions/services/create.service.js");
const { updateTransaction } = await import("../../../transactions/services/update.service.js");
const { auditLog } = await import("../../../../utils/auditLog.js");
const { registerTools } = await import("../tools.controller.js");

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }>;

const authWith = (scopes: string[]): McpAuth =>
  ({ token: "t", clientId: "k1", scopes, extra: { userId: "u1", kind: "apiKey" } }) as McpAuth;

function register(scopes: string[]) {
  const tools = new Map<string, { config: Record<string, unknown>; handler: Handler }>();
  const server = {
    registerTool: (name: string, config: Record<string, unknown>, handler: Handler) =>
      tools.set(name, { config, handler })
  };
  registerTools(server as never, authWith(scopes));
  return tools;
}

const READ_TOOLS = [
  "get_exchange_rate",
  "get_profile",
  "get_report",
  "get_transaction",
  "get_transaction_summary",
  "list_accounts",
  "list_categories",
  "list_currencies",
  "list_debts",
  "list_groups",
  "list_imported_transactions",
  "list_notifications",
  "list_shared_expenses",
  "search_transactions",
  "search_users"
];

const WRITE_TOOLS = [
  "add_group_member",
  "create_account",
  "create_category",
  "create_group",
  "create_group_category",
  "create_shared_expense",
  "create_transaction",
  "delete_account",
  "delete_category",
  "delete_transaction",
  "get_exchange_rate",
  "get_profile",
  "get_report",
  "get_transaction",
  "get_transaction_summary",
  "ignore_imported_transactions",
  "import_imported_transactions",
  "list_accounts",
  "list_categories",
  "list_currencies",
  "list_debts",
  "list_groups",
  "list_imported_transactions",
  "list_notifications",
  "list_shared_expenses",
  "mark_notifications_read",
  "remove_group_member",
  "request_settlement",
  "search_transactions",
  "search_users",
  "set_account_archived",
  "set_category_archived",
  "set_group_archived",
  "unignore_imported_transactions",
  "update_account",
  "update_category",
  "update_group",
  "update_imported_transaction",
  "update_preferences",
  "update_transaction"
];

const validBody = { name: "Coffee", amount: 3, type: "expense", date: "2024-01-01" };

beforeEach(() => vi.clearAllMocks());

describe("registerTools", () => {
  it("registers exactly the fifteen read tools for a read credential", () => {
    expect([...register(["read"]).keys()].sort()).toEqual(READ_TOOLS);
  });

  it("registers exactly the forty tools for a write credential, with the annotations from the spec", () => {
    const tools = register(["read", "write"]);
    expect([...tools.keys()].sort()).toEqual(WRITE_TOOLS);
    expect(tools.get("list_accounts")!.config.annotations).toEqual({ readOnlyHint: true });
    expect(tools.get("update_transaction")!.config.annotations).toEqual({ idempotentHint: true });
  });

  it("read tools call services with the credential's user id only", async () => {
    const tools = register(["read"]);
    vi.mocked(listAccounts).mockResolvedValue([] as never);
    vi.mocked(listCategories).mockResolvedValue([] as never);
    vi.mocked(listTransactions).mockResolvedValue({ data: [], meta: {} } as never);
    vi.mocked(getTransactionsSummary).mockResolvedValue({ income: 1, expenses: 2, balance: -1 });

    await tools.get("list_accounts")!.handler({});
    await tools.get("list_categories")!.handler({});
    const search = await tools.get("search_transactions")!.handler({ page: 1, pageSize: 5 });
    const summary = await tools.get("get_transaction_summary")!.handler({ type: "income" });

    expect(listAccounts).toHaveBeenCalledWith("u1", undefined);
    expect(listCategories).toHaveBeenCalledWith("u1", {}, undefined);
    expect(listTransactions).toHaveBeenCalledWith("u1", expect.stringContaining('"pageSize":5'));
    expect(getTransactionsSummary).toHaveBeenCalledWith("u1", expect.stringContaining('"income"'));
    expect(search.isError).toBeUndefined();
    expect(summary.content[0]!.text).toBe('{"income":1,"expenses":2,"balance":-1}');
  });

  it("maps service errors to isError results", async () => {
    vi.mocked(listAccounts).mockRejectedValue(new HttpError(404, "Nope"));
    const result = await register(["read"]).get("list_accounts")!.handler({});
    expect(result).toMatchObject({ isError: true, content: [{ text: "Nope" }] });
  });
});

describe("write tools", () => {
  it("create re-parses with the full schema, creates for the user and audits once", async () => {
    vi.mocked(createTransaction).mockResolvedValue({ id: "t1", ...validBody } as never);
    const result = await register(["read", "write"]).get("create_transaction")!.handler(validBody);

    expect(createTransaction).toHaveBeenCalledWith("u1", expect.objectContaining({ name: "Coffee" }));
    expect(result.isError).toBeUndefined();
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith({
      userId: "u1",
      credentialKind: "apiKey",
      credentialId: "k1",
      op: "mcp.create_transaction",
      resourceId: "t1",
      status: 201
    });
  });

  it("create rejects a transfer without accounts (refinement) and audits the failure", async () => {
    const result = await register(["read", "write"])
      .get("create_transaction")!
      .handler({ ...validBody, type: "transfer" });

    expect(result.isError).toBe(true);
    expect(createTransaction).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(vi.mocked(auditLog).mock.calls[0]![0]).toMatchObject({ status: 400, resourceId: null });
  });

  it("update splits the id, calls the service and audits with the id", async () => {
    vi.mocked(updateTransaction).mockResolvedValue({ id: "t1" } as never);
    await register(["read", "write"]).get("update_transaction")!.handler({ id: "t1", name: "New" });

    expect(updateTransaction).toHaveBeenCalledWith("u1", "t1", { name: "New" });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ op: "mcp.update_transaction", resourceId: "t1", status: 200 })
    );
  });

  it("update surfaces 'Transaction not found' and audits the HTTP status", async () => {
    vi.mocked(updateTransaction).mockRejectedValue(new HttpError(404, "Transaction not found"));
    const result = await register(["read", "write"])
      .get("update_transaction")!
      .handler({ id: "x", name: "New" });

    expect(result).toMatchObject({ isError: true, content: [{ text: "Transaction not found" }] });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ status: 404, resourceId: "x" }));
  });

  it("write handlers refuse a credential without the write scope even if registered", async () => {
    // A read-only auth object whose scopes gain `write` only at registration time simulates a registration regression.
    const auth = authWith(["write"]);
    const tools = new Map<string, Handler>();
    registerTools({ registerTool: (n: string, _c: unknown, h: Handler) => tools.set(n, h) } as never, auth);
    auth.scopes = ["read"];

    const result = await tools.get("create_transaction")!(validBody);

    expect(result.isError).toBe(true);
    expect(createTransaction).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });
});
