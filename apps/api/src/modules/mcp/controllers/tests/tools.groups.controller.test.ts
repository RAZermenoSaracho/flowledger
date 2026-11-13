import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../../utils/httpError.js";
import type { McpAuth } from "../../types/mcp.types.js";

vi.mock("../../../debts/services/create.service.js", () => ({ createSettlementRequest: vi.fn() }));
vi.mock("../../../groups/services/create.service.js", () => ({
  addGroupCategory: vi.fn(),
  addGroupMember: vi.fn(),
  createGroup: vi.fn()
}));
vi.mock("../../../users/services/read.service.js", () => ({ searchUsers: vi.fn(), listBlocks: vi.fn() }));
vi.mock("../../../groups/services/delete.service.js", () => ({ removeGroupMember: vi.fn() }));
vi.mock("../../../groups/services/read.service.js", () => ({ getMemberGroup: vi.fn(), listGroups: vi.fn() }));
vi.mock("../../../groups/services/update.service.js", () => ({
  archiveGroup: vi.fn(),
  restoreGroup: vi.fn(),
  updateGroup: vi.fn()
}));
vi.mock("../../../shared-expenses/services/create.service.js", () => ({ createSharedExpense: vi.fn() }));
vi.mock("../../../shared-expenses/services/read.service.js", () => ({
  getSharedExpenseById: vi.fn(),
  assertOwnedSharingTransaction: vi.fn(),
  listSharedExpenses: vi.fn()
}));
vi.mock("../../../shared-expenses/services/update.service.js", () => ({ respondToSharedExpense: vi.fn() }));
vi.mock("../../../users/services/create.service.js", () => ({ blockUser: vi.fn() }));
vi.mock("../../../users/services/delete.service.js", () => ({ unblockUser: vi.fn() }));
vi.mock("../../../../utils/auditLog.js", () => ({ auditLog: vi.fn() }));

const { createSettlementRequest } = await import("../../../debts/services/create.service.js");
const { addGroupCategory, addGroupMember, createGroup } = await import("../../../groups/services/create.service.js");
const { listBlocks, searchUsers } = await import("../../../users/services/read.service.js");
const { removeGroupMember } = await import("../../../groups/services/delete.service.js");
const { getMemberGroup, listGroups } = await import("../../../groups/services/read.service.js");
const { archiveGroup, restoreGroup, updateGroup } = await import("../../../groups/services/update.service.js");
const { createSharedExpense } = await import("../../../shared-expenses/services/create.service.js");
const { listSharedExpenses } = await import(
  "../../../shared-expenses/services/read.service.js"
);
const { respondToSharedExpense } = await import("../../../shared-expenses/services/update.service.js");
const { blockUser } = await import("../../../users/services/create.service.js");
const { unblockUser } = await import("../../../users/services/delete.service.js");
const { auditLog } = await import("../../../../utils/auditLog.js");
const { registerGroupReadTools, registerGroupWriteTools } = await import("../tools.groups.controller.js");

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; structuredContent?: Record<string, any> }>; // eslint-disable-line @typescript-eslint/no-explicit-any

function register(scopes: string[]) {
  const auth = { token: "t", clientId: "k1", scopes, extra: { userId: "u1", kind: "apiKey" } } as McpAuth;
  const tools = new Map<string, { config: Record<string, any>; handler: Handler }>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const server = { registerTool: (n: string, config: Record<string, unknown>, handler: Handler) => tools.set(n, { config, handler }) };
  registerGroupReadTools(server as never, auth);
  if (scopes.includes("write")) registerGroupWriteTools(server as never, auth);
  return tools;
}
const tools = register(["read", "write"]);
const readOnly = register(["read"]);
const run = (name: string, args: Record<string, unknown>, set = tools) => set.get(name)!.handler(args);

beforeEach(() => vi.clearAllMocks());

describe("group tool registration", () => {
  it("registers four reads and twelve writes with the spec annotations and no approval or delete tool", () => {
    expect([...tools.keys()]).toEqual([
      "list_groups", "list_shared_expenses", "list_blocked_users", "search_users", "accept_shared_expense", "reject_shared_expense", "block_user", "unblock_user", "create_group", "update_group", "set_group_archived",
      "remove_group_member", "add_group_member", "create_group_category", "create_shared_expense", "request_settlement"
    ]);
    expect(tools.get("list_groups")!.config.annotations).toEqual({ readOnlyHint: true });
    expect(tools.get("search_users")!.config.annotations).toEqual({ readOnlyHint: true });
    expect(tools.get("remove_group_member")!.config.annotations).toMatchObject({ destructiveHint: true });
    expect(tools.get("set_group_archived")!.config.annotations).toEqual({ idempotentHint: true });
    for (const name of ["create_shared_expense", "request_settlement", "remove_group_member", "update_group", "add_group_member", "create_group_category"]) {
      expect(tools.get(name)!.config.description).toMatch(/notif|Affects|access/i);
    }
  });
});

describe("group read tools", () => {
  it("list_groups returns the list, or one group via the not-found-safe lookup", async () => {
    vi.mocked(listGroups).mockResolvedValue([{ id: "g1" }] as never);
    vi.mocked(getMemberGroup).mockResolvedValue({ id: "g1" } as never);

    expect((await run("list_groups", {}, readOnly)).structuredContent).toEqual({ groups: [{ id: "g1" }] });
    expect(listGroups).toHaveBeenCalledWith("u1", undefined);
    expect((await run("list_groups", { id: "g1" }, readOnly)).structuredContent).toEqual({ group: { id: "g1" } });
    expect(getMemberGroup).toHaveBeenCalledWith("u1", "g1");
  });

  it("list_shared_expenses caps at 100 rows with the full total", async () => {
    vi.mocked(listSharedExpenses).mockResolvedValue(Array.from({ length: 130 }, (_, i) => ({ id: String(i) })) as never);

    const result = await run("list_shared_expenses", {}, readOnly);

    expect(result.structuredContent!.sharedExpenses).toHaveLength(100);
    expect(result.structuredContent!.total).toBe(130);
  });

  it("maps a not-found service error to an error result", async () => {
    vi.mocked(getMemberGroup).mockRejectedValue(new HttpError(404, "Group not found"));
    expect((await run("list_groups", { id: "x" }, readOnly)).isError).toBe(true);
  });
});

describe("search_users", () => {
  it("searches as the credential user with the default limit and rejects short queries and big limits", async () => {
    vi.mocked(searchUsers).mockResolvedValue([{ id: "u2" }] as never);

    expect((await run("search_users", { q: " bob " }, readOnly)).structuredContent).toEqual({ users: [{ id: "u2" }] });
    expect(searchUsers).toHaveBeenCalledWith("u1", "bob", 10);
    expect((await run("search_users", { q: "bo" }, readOnly)).isError).toBe(true);
    expect((await run("search_users", { q: "bob", limit: 11 }, readOnly)).isError).toBe(true);
    expect(searchUsers).toHaveBeenCalledTimes(1);
  });
});

describe("group write tools", () => {
  it("are absent from a read-only registration's write set and refuse without the write scope", async () => {
    const auth = { token: "t", clientId: "k1", scopes: ["read"], extra: { userId: "u1", kind: "apiKey" } } as McpAuth;
    const forced = new Map<string, Handler>();
    registerGroupWriteTools({ registerTool: (n: string, _c: unknown, h: Handler) => forced.set(n, h) } as never, auth);

    const result = await forced.get("request_settlement")!({ debtId: "d", amount: "5", accountId: "a", categoryId: "c" });

    expect(result.isError).toBe(true);
    expect(createSettlementRequest).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "mcp.request_settlement", status: 403, resourceId: "d" }));
  });

  it("create_group and update_group act as the credential user and strip unknown keys", async () => {
    vi.mocked(createGroup).mockResolvedValue({ id: "g1" } as never);
    vi.mocked(updateGroup).mockResolvedValue({ id: "g1" } as never);

    await run("create_group", { name: "Trip", ownerUserId: "evil" });
    await run("update_group", { id: "g1", name: "New", ownerUserId: "evil" });

    expect(createGroup).toHaveBeenCalledWith("u1", { name: "Trip" });
    expect(updateGroup).toHaveBeenCalledWith("u1", "g1", { name: "New" });
    expect(auditLog).toHaveBeenCalledTimes(2);
  });

  it.each([[true, archiveGroup], [false, restoreGroup]])("set_group_archived archived=%s", async (archived, service) => {
    vi.mocked(service).mockResolvedValue({ id: "g1" } as never);
    await run("set_group_archived", { id: "g1", archived });
    expect(service).toHaveBeenCalledWith("u1", "g1");
  });

  it("remove_group_member defaults to the caller and passes an explicit member through", async () => {
    await run("remove_group_member", { groupId: "g1" });
    await run("remove_group_member", { groupId: "g1", userId: "u2" });

    expect(removeGroupMember).toHaveBeenNthCalledWith(1, "u1", "g1", "u1");
    expect(removeGroupMember).toHaveBeenNthCalledWith(2, "u1", "g1", "u2");
  });

  it("create_shared_expense propagates ownership errors and audits a refusal", async () => {
    vi.mocked(createSharedExpense).mockRejectedValueOnce(new HttpError(404, "Transaction not found"));

    const result = await run("create_shared_expense", { transactionId: "t1", title: "x" });

    expect(result.isError).toBe(true);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "mcp.create_shared_expense", status: 404 }));
  });

  it("create_shared_expense uses the universal web service", async () => {
    vi.mocked(createSharedExpense).mockResolvedValue({ id: "s1" } as never);

    await run("create_shared_expense", { transactionId: "t1", title: "x" });

    expect(createSharedExpense).toHaveBeenCalledWith("u1", expect.objectContaining({ transactionId: "t1" }));
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "s1", status: 201 }));
  });

  it("request_settlement splits the debt id from the body", async () => {
    vi.mocked(createSettlementRequest).mockResolvedValue({ id: "r1" } as never);

    await run("request_settlement", { debtId: "d1", amount: "5", accountId: "a", categoryId: "c" });

    expect(createSettlementRequest).toHaveBeenCalledWith("u1", "d1", { amount: "5", accountId: "a", categoryId: "c" });
  });

  it("add_group_member adds the picked user as the credential user and audits the group", async () => {
    vi.mocked(addGroupMember).mockResolvedValue({ id: "m1" } as never);

    const result = await run("add_group_member", { groupId: "g1", userId: "u2" });

    expect(addGroupMember).toHaveBeenCalledWith("u1", "g1", "u2");
    expect(result.structuredContent).toEqual({ member: { id: "m1" } });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "mcp.add_group_member", resourceId: "g1", status: 201 }));
    expect((await run("add_group_member", { groupId: "g1", userId: "u2", role: "admin" })).isError).toBe(true);
  });

  it("add_group_member surfaces a service refusal and audits its status", async () => {
    vi.mocked(addGroupMember).mockRejectedValue(new HttpError(404, "Group not found"));
    expect((await run("add_group_member", { groupId: "g1", userId: "u2" })).isError).toBe(true);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "mcp.add_group_member", status: 404 }));
  });

  it("create_group_category splits the group id from the category body", async () => {
    vi.mocked(addGroupCategory).mockResolvedValue({ id: "c1" } as never);

    await run("create_group_category", { groupId: "g1", name: "Rent", type: "expense" });

    expect(addGroupCategory).toHaveBeenCalledWith("u1", "g1", { name: "Rent", type: "expense" });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "mcp.create_group_category", resourceId: "g1", status: 201 }));
  });
});

describe("consent and blocking tools", () => {
  it.each([["accept_shared_expense", "accepted"], ["reject_shared_expense", "rejected"]])("%s uses the caller and audits once", async (name, acceptance) => {
    vi.mocked(respondToSharedExpense).mockResolvedValue({ id: "s1" } as never);
    expect((await run(name, { id: "s1" })).structuredContent).toEqual({ sharedExpense: { id: "s1" } });
    expect(respondToSharedExpense).toHaveBeenCalledWith("u1", "s1", acceptance, undefined);
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: `mcp.${name}`, status: 200 }));
    expect(readOnly.has(name)).toBe(false);
    expect(respondToSharedExpense).toHaveBeenCalledTimes(1);
  });
  it("passes the optional participantId through to a single allocation", async () => {
    vi.mocked(respondToSharedExpense).mockClear();
    vi.mocked(respondToSharedExpense).mockResolvedValue({ id: "s1" } as never);
    await run("accept_shared_expense", { id: "s1", participantId: "p2" });
    expect(respondToSharedExpense).toHaveBeenCalledWith("u1", "s1", "accepted", "p2");
  });
  it.each(["accept_shared_expense", "reject_shared_expense", "block_user", "unblock_user"])("%s refuses a forced read-only call and audits once", async (name) => {
    const handlers = new Map<string, Handler>();
    const auth = { token: "t", clientId: "k1", scopes: ["read"], extra: { userId: "u1", kind: "apiKey" } } as McpAuth;
    registerGroupWriteTools({ registerTool: (n: string, _c: unknown, h: Handler) => handlers.set(n, h) } as never, auth);
    expect((await handlers.get(name)!({ id: "s1", userId: "u2" })).isError).toBe(true);
    expect(respondToSharedExpense).not.toHaveBeenCalled();
    expect(blockUser).not.toHaveBeenCalled();
    expect(unblockUser).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: `mcp.${name}`, status: 403 }));
  });
  it("lists, blocks and unblocks through the same caller-scoped services", async () => {
    vi.mocked(listBlocks).mockResolvedValue([]);
    vi.mocked(blockUser).mockResolvedValue({ id: "block" } as never);
    expect((await run("list_blocked_users", {}, readOnly)).structuredContent).toEqual({ blocks: [] });
    await run("block_user", { userId: "u2" });
    await run("unblock_user", { userId: "u2" });
    expect(listBlocks).toHaveBeenCalledWith("u1");
    expect(blockUser).toHaveBeenCalledWith("u1", "u2");
    expect(unblockUser).toHaveBeenCalledWith("u1", "u2");
    expect(auditLog).toHaveBeenCalledTimes(2);
    for (const name of ["block_user", "unblock_user"]) expect(readOnly.has(name)).toBe(false);
  });
});
