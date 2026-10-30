import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpAuth } from "../../types/mcp.types.js";

vi.mock("../../../notifications/services/update.service.js", () => ({
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn()
}));
vi.mock("../../../users/services/preferences.service.js", () => ({ updatePreferences: vi.fn() }));
vi.mock("../../../../utils/auditLog.js", () => ({ auditLog: vi.fn() }));

const { markAllNotificationsRead, markNotificationRead } = await import("../../../notifications/services/update.service.js");
const { updatePreferences } = await import("../../../users/services/preferences.service.js");
const { auditLog } = await import("../../../../utils/auditLog.js");
const { registerUserWriteTools } = await import("../tools.user.controller.js");

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; structuredContent?: unknown }>;

function register(scopes: string[]) {
  const auth = { token: "t", clientId: "k1", scopes, extra: { userId: "u1", kind: "apiKey" } } as McpAuth;
  const tools = new Map<string, { config: Record<string, any>; handler: Handler }>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  registerUserWriteTools(
    { registerTool: (n: string, config: Record<string, unknown>, handler: Handler) => tools.set(n, { config, handler }) } as never,
    auth
  );
  return tools;
}
const write = register(["read", "write"]);
const run = (name: string, args: Record<string, unknown>) => write.get(name)!.handler(args);

beforeEach(() => vi.clearAllMocks());

describe("registerUserWriteTools", () => {
  it("registers update_preferences and mark_notifications_read as idempotent", () => {
    expect([...write.keys()]).toEqual(["update_preferences", "mark_notifications_read"]);
    for (const { config } of write.values()) expect(config.annotations).toEqual({ idempotentHint: true });
  });

  it("update_preferences forwards only name and preferredCurrency and strips passwordHash", async () => {
    vi.mocked(updatePreferences).mockResolvedValue({ id: "u1", name: "Ada", passwordHash: "x" } as never);
    const result = await run("update_preferences", { name: "Ada", email: "evil@example.com", planType: "pro" });

    expect(updatePreferences).toHaveBeenCalledWith("u1", { name: "Ada" });
    expect(result.structuredContent).toEqual({ user: { id: "u1", name: "Ada" } });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "mcp.update_preferences", status: 200 }));
  });

  it("update_preferences with no field is rejected", async () => {
    expect((await run("update_preferences", {})).isError).toBe(true);
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("mark_notifications_read marks one by id", async () => {
    vi.mocked(markNotificationRead).mockResolvedValue({ id: "n1" } as never);
    const result = await run("mark_notifications_read", { id: "n1" });

    expect(markNotificationRead).toHaveBeenCalledWith("u1", "n1");
    expect(result.structuredContent).toEqual({ notification: { id: "n1" } });
  });

  it("mark_notifications_read marks all with all: true", async () => {
    const result = await run("mark_notifications_read", { all: true });

    expect(markAllNotificationsRead).toHaveBeenCalledWith("u1");
    expect(result.structuredContent).toEqual({ allRead: true });
  });

  it.each([{}, { id: "n1", all: true }, { all: false }])("mark_notifications_read rejects %j", async (args) => {
    expect((await run("mark_notifications_read", args)).isError).toBe(true);
    expect(markNotificationRead).not.toHaveBeenCalled();
    expect(markAllNotificationsRead).not.toHaveBeenCalled();
  });

  it("refuses without the write scope", async () => {
    const result = await register(["read"]).get("update_preferences")!.handler({ name: "Ada" });

    expect(result.isError).toBe(true);
    expect(updatePreferences).not.toHaveBeenCalled();
  });
});
