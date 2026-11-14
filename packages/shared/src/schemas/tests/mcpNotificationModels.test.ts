import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_RULES } from "../notificationRules.js";
import {
  createNotificationModelToolSchema,
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
