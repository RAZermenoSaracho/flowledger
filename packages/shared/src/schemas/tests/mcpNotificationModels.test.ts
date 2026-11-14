import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_RULES } from "../notificationRules.js";
import {
  createNotificationModelToolSchema,
  notificationQueueToolSchema,
  notificationLogsToolSchema,
  listNotificationLibraryToolSchema,
  testNotificationModelToolSchema,
  updateNotificationModelToolSchema
} from "../mcpNotificationModels.js";

describe("create_notification_model tool schema", () => {
  it("accepts name only, applying REST defaults", () => {
    const parsed = createNotificationModelToolSchema.parse({ name: "Bank" });
    expect(parsed).toMatchObject({ name: "Bank", slots: [], bindings: {}, isActive: false });
    expect(parsed.code).toBeUndefined();
  });

  it("rejects code together with rules and unknown keys", () => {
    expect(createNotificationModelToolSchema.safeParse({ name: "B", code: "x", rules: DEFAULT_NOTIFICATION_RULES }).success).toBe(false);
    expect(createNotificationModelToolSchema.safeParse({ name: "B", rules: DEFAULT_NOTIFICATION_RULES }).success).toBe(true);
    expect(createNotificationModelToolSchema.safeParse({ name: "B", userId: "x" }).success).toBe(false);
  });

  it("rejects visibility public and invalid rules", () => {
    expect(createNotificationModelToolSchema.safeParse({ name: "B", visibility: "public" }).success).toBe(false);
    expect(createNotificationModelToolSchema.safeParse({ name: "B", rules: { normalize: true, rules: [], fallbackReason: "x" } }).success).toBe(false);
  });
});

describe("update_notification_model tool schema", () => {
  it("requires id and enforces code/rules exclusivity", () => {
    expect(updateNotificationModelToolSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(updateNotificationModelToolSchema.safeParse({ id: "m", visibility: "private" }).success).toBe(true);
    expect(updateNotificationModelToolSchema.safeParse({ id: "m", code: "", rules: DEFAULT_NOTIFICATION_RULES }).success).toBe(false);
  });
});

describe("other notification tool schemas", () => {
  it("test tool needs id and text; library modelId is optional", () => {
    expect(testNotificationModelToolSchema.safeParse({ id: "m", text: "hi" }).success).toBe(true);
    expect(testNotificationModelToolSchema.safeParse({ text: "hi" }).success).toBe(false);
    expect(listNotificationLibraryToolSchema.parse({})).toEqual({});
  });
});

describe.each([
  ["queue", notificationQueueToolSchema, ["queued", "processing"], ["completed", "skipped", "failed"]],
  ["logs", notificationLogsToolSchema, ["completed", "skipped", "failed"], ["queued", "processing"]]
] as const)("%s run schema", (_name, schema, valid, invalid) => {
  it("defaults pagination and restricts status, size and unknown fields", () => {
    expect(schema.parse({ id: "m1" })).toEqual({ id: "m1", page: 1, pageSize: 50 });
    for (const status of valid) expect(schema.safeParse({ id: "m1", status }).success).toBe(true);
    for (const status of [...invalid, "unknown"]) expect(schema.safeParse({ id: "m1", status }).success).toBe(false);
    for (const input of [{ pageSize: 101 }, { pageSize: 0 }, { page: 0 }, { query: "{}" }]) {
      expect(schema.safeParse({ id: "m1", ...input }).success).toBe(false);
    }
  });

  it("accepts date-only and ISO datetime bounds and rejects invalid dates", () => {
    expect(schema.safeParse({ id: "m1", receivedFrom: "2026-01-01", receivedTo: "2026-01-02T00:00:00-06:00" }).success).toBe(true);
    expect(schema.safeParse({ id: "m1", receivedFrom: "invalid" }).success).toBe(false);
  });
});
