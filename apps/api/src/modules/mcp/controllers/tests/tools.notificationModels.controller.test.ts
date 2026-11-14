import { generateNotificationCode, DEFAULT_NOTIFICATION_RULES } from "@flowledger/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../../utils/httpError.js";
import type { McpAuth } from "../../types/mcp.types.js";

vi.mock("../../../notificationModels/services/create.service.js", () => ({ createModel: vi.fn() }));
vi.mock("../../../notificationModels/services/delete.service.js", () => ({ deleteModel: vi.fn() }));
vi.mock("../../../notificationModels/services/library.service.js", () => ({
  getLibraryModel: vi.fn(),
  installModel: vi.fn(),
  listLibrary: vi.fn(),
  publishModel: vi.fn(),
  updateFromSource: vi.fn()
}));
vi.mock("../../../notificationModels/services/read.service.js", () => ({ getModelById: vi.fn(), listModels: vi.fn() }));
vi.mock("../../../notificationModels/services/test.service.js", () => ({
  parseCodeToRules: vi.fn(),
  testModel: vi.fn(),
  validateCode: vi.fn()
}));
vi.mock("../../../notificationModels/services/update.service.js", () => ({ updateModel: vi.fn() }));
vi.mock("../../../../utils/auditLog.js", () => ({ auditLog: vi.fn() }));

const { createModel } = await import("../../../notificationModels/services/create.service.js");
const { deleteModel } = await import("../../../notificationModels/services/delete.service.js");
const { getLibraryModel, installModel, listLibrary, publishModel, updateFromSource } = await import("../../../notificationModels/services/library.service.js");
const { getModelById, listModels } = await import("../../../notificationModels/services/read.service.js");
const { parseCodeToRules, testModel, validateCode } = await import("../../../notificationModels/services/test.service.js");
const { updateModel } = await import("../../../notificationModels/services/update.service.js");
const { auditLog } = await import("../../../../utils/auditLog.js");
const { registerNotificationModelReadTools, registerNotificationModelWriteTools } = await import("../tools.notificationModels.controller.js");

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; structuredContent?: Record<string, any> }>; // eslint-disable-line @typescript-eslint/no-explicit-any

function register(scopes: string[], forceWrites = false) {
  const auth = { token: "t", clientId: "k1", scopes, extra: { userId: "u1", kind: "apiKey" } } as McpAuth;
  const tools = new Map<string, { config: Record<string, any>; handler: Handler }>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const server = { registerTool: (n: string, config: Record<string, unknown>, handler: Handler) => tools.set(n, { config, handler }) };
  registerNotificationModelReadTools(server as never, auth);
  if (forceWrites || scopes.includes("write")) registerNotificationModelWriteTools(server as never, auth);
  return tools;
}
const tools = register(["read", "write"]);
const readOnly = register(["read"]);
const run = (name: string, args: Record<string, unknown>, set = tools) => set.get(name)!.handler(args);

beforeEach(() => vi.clearAllMocks());

describe("notification model tool registration", () => {
  it("registers six reads for a read credential and six more writes for a write credential", () => {
    expect([...readOnly.keys()]).toEqual([
      "list_notification_models", "get_notification_model", "list_notification_library",
      "validate_notification_code", "parse_notification_rules", "test_notification_model"
    ]);
    expect([...tools.keys()].slice(6)).toEqual([
      "create_notification_model", "update_notification_model", "delete_notification_model",
      "publish_notification_model", "install_notification_model", "update_notification_model_from_source"
    ]);
  });

  it("annotates reads, deletes and updates, and describes the dry-run and workflow", () => {
    for (const name of [...readOnly.keys()]) expect(tools.get(name)!.config.annotations).toEqual({ readOnlyHint: true });
    expect(tools.get("delete_notification_model")!.config.annotations).toMatchObject({ destructiveHint: true });
    expect(tools.get("update_notification_model")!.config.annotations).toEqual({ idempotentHint: true });
    expect(tools.get("test_notification_model")!.config.description).toMatch(/NO transactions/);
    expect(tools.get("create_notification_model")!.config.description).toMatch(/BINDINGS.*list_accounts/s);
    expect(tools.get("create_notification_model")!.config.description).toContain("Not idempotent");
    expect(tools.get("update_notification_model")!.config.description).toContain("unpublishes");
  });
});

describe("notification model read tools", () => {
  it("list and get call the services as the credential user", async () => {
    vi.mocked(listModels).mockResolvedValue({ data: [{ id: "m1" }], meta: { total: 1 } } as never);
    vi.mocked(getModelById).mockResolvedValue({ id: "m1" } as never);

    expect((await run("list_notification_models", { query: "{}" }, readOnly)).structuredContent).toEqual({ data: [{ id: "m1" }], meta: { total: 1 } });
    expect(listModels).toHaveBeenCalledWith("u1", "{}");
    expect((await run("get_notification_model", { id: "m1" }, readOnly)).structuredContent).toEqual({ model: { id: "m1" } });
    expect(getModelById).toHaveBeenCalledWith("u1", "m1");
  });

  it("propagates not-found as an error result", async () => {
    vi.mocked(getModelById).mockRejectedValue(new HttpError(404, "Notification model not found"));
    expect((await run("get_notification_model", { id: "x" }, readOnly)).isError).toBe(true);
  });

  it("list_notification_library returns the list or one entry", async () => {
    vi.mocked(listLibrary).mockResolvedValue([{ id: "l1" }] as never);
    vi.mocked(getLibraryModel).mockResolvedValue({ id: "l1" } as never);

    expect((await run("list_notification_library", {}, readOnly)).structuredContent).toEqual({ data: [{ id: "l1" }] });
    expect((await run("list_notification_library", { modelId: "l1" }, readOnly)).structuredContent).toEqual({ entry: { id: "l1" } });
    expect(getLibraryModel).toHaveBeenCalledWith("u1", "l1");
  });

  it("validate and parse delegate to the sandbox services", async () => {
    vi.mocked(validateCode).mockResolvedValue({ errors: [] });
    vi.mocked(parseCodeToRules).mockResolvedValue({ unsupported: ["x"] } as never);

    expect((await run("validate_notification_code", { code: "c" }, readOnly)).structuredContent).toEqual({ errors: [] });
    expect(validateCode).toHaveBeenCalledWith("u1", "c");
    expect((await run("parse_notification_rules", { code: "c" }, readOnly)).structuredContent).toEqual({ unsupported: ["x"] });
    expect(parseCodeToRules).toHaveBeenCalledWith("u1", "c");
  });

  it("test_notification_model returns the preview without any write service or audit", async () => {
    vi.mocked(testModel).mockResolvedValue({ outcome: "proposal", transactionPreview: { name: "Coffee" } } as never);

    const result = await run("test_notification_model", { id: "m1", text: "hi", settings: { a: "b" } }, readOnly);

    expect(result.structuredContent).toMatchObject({ outcome: "proposal", transactionPreview: { name: "Coffee" } });
    expect(testModel).toHaveBeenCalledWith("u1", "m1", { text: "hi", settings: { a: "b" } });
    expect(createModel).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });
});

describe("notification model write tools", () => {
  it("refuse without the write scope and audit the 403", async () => {
    const forced = register(["read"], true);

    const result = await run("delete_notification_model", { id: "m1" }, forced);

    expect(result.isError).toBe(true);
    expect(deleteModel).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "mcp.delete_notification_model", status: 403, resourceId: "m1" }));
  });

  it("create passes REST-shaped input as the credential user", async () => {
    vi.mocked(createModel).mockResolvedValue({ id: "m1" } as never);

    await run("create_notification_model", { name: "Bank", code: "def process(text, ctx): pass" });

    expect(createModel).toHaveBeenCalledWith("u1", expect.objectContaining({ name: "Bank", code: "def process(text, ctx): pass", isActive: false }));
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "mcp.create_notification_model", status: 201, resourceId: "m1" }));
  });

  it("create with rules saves exactly the code the web Form editor generates", async () => {
    vi.mocked(createModel).mockResolvedValue({ id: "m1" } as never);

    await run("create_notification_model", { name: "Bank", rules: DEFAULT_NOTIFICATION_RULES });

    const body = vi.mocked(createModel).mock.calls[0]![1];
    expect(body.code).toBe(generateNotificationCode(DEFAULT_NOTIFICATION_RULES));
    expect(body).not.toHaveProperty("rules");
  });

  it("rejects code together with rules on create and update", async () => {
    const both = { code: "x", rules: DEFAULT_NOTIFICATION_RULES };

    expect((await run("create_notification_model", { name: "B", ...both })).isError).toBe(true);
    expect((await run("update_notification_model", { id: "m1", ...both })).isError).toBe(true);
    expect(createModel).not.toHaveBeenCalled();
    expect(updateModel).not.toHaveBeenCalled();
  });

  it("update scopes by user, generates code from rules and allows unpublishing", async () => {
    vi.mocked(updateModel).mockResolvedValue({ id: "m1" } as never);

    await run("update_notification_model", { id: "m1", rules: DEFAULT_NOTIFICATION_RULES, visibility: "private" });
    expect(updateModel).toHaveBeenCalledWith("u1", "m1", { code: generateNotificationCode(DEFAULT_NOTIFICATION_RULES), visibility: "private" });

    expect((await run("update_notification_model", { id: "m1", visibility: "public" })).isError).toBe(true);
  });

  it("delete, publish, install and update-from-source call the library/delete services as the user", async () => {
    vi.mocked(publishModel).mockResolvedValue({ model: { id: "m1" }, version: { id: "v1" } } as never);
    vi.mocked(installModel).mockResolvedValue({ id: "m2" } as never);
    vi.mocked(updateFromSource).mockResolvedValue({ id: "m2" } as never);

    await run("delete_notification_model", { id: "m1" });
    expect((await run("publish_notification_model", { id: "m1" })).structuredContent).toEqual({ model: { id: "m1" }, version: { id: "v1" } });
    expect((await run("install_notification_model", { modelId: "l1" })).structuredContent).toEqual({ model: { id: "m2" } });
    await run("update_notification_model_from_source", { id: "m2", versionId: "v1", bindings: { acc: "a1" } });

    expect(deleteModel).toHaveBeenCalledWith("u1", "m1");
    expect(publishModel).toHaveBeenCalledWith("u1", "m1");
    expect(installModel).toHaveBeenCalledWith("u1", "l1");
    expect(updateFromSource).toHaveBeenCalledWith("u1", "m2", { versionId: "v1", bindings: { acc: "a1" } });
    expect(auditLog).toHaveBeenCalledTimes(4);
  });

  it("propagates not-found from a write service", async () => {
    vi.mocked(deleteModel).mockRejectedValue(new HttpError(404, "Notification model not found"));
    expect((await run("delete_notification_model", { id: "x" })).isError).toBe(true);
  });
});
