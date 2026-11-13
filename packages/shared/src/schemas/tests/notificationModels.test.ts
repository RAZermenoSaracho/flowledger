import { describe, expect, it } from "vitest";
import {
  createNotificationModelSchema,
  notificationIngestSchema,
  notificationIdempotencyKeySchema,
  notificationProposalSchema,
  notificationSlotsSchema,
  notificationTestSchema,
  updateNotificationModelSchema,
  updateFromSourceSchema
} from "../notificationModels.js";

const slot = { key: "card", kind: "account", label: "Card", required: true };

describe("notificationSlotsSchema", () => {
  it("accepts valid slots", () => {
    expect(notificationSlotsSchema.safeParse([slot]).success).toBe(true);
  });

  it.each([["Card"], ["1card"], ["a".repeat(41)], ["car-d"]])("rejects key %s", (key) => {
    expect(notificationSlotsSchema.safeParse([{ ...slot, key }]).success).toBe(false);
  });

  it("rejects an unknown kind, duplicate keys and more than 20 slots", () => {
    expect(notificationSlotsSchema.safeParse([{ ...slot, kind: "debt" }]).success).toBe(false);
    expect(notificationSlotsSchema.safeParse([slot, slot]).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => ({ ...slot, key: `k${i}` }));
    expect(notificationSlotsSchema.safeParse(many).success).toBe(false);
  });
});

describe("createNotificationModelSchema", () => {
  it("applies defaults", () => {
    expect(createNotificationModelSchema.parse({ name: "Plata" })).toMatchObject({
      code: "",
      slots: [],
      bindings: {},
      settings: {},
      isActive: false,
      visibility: "private"
    });
  });

  it("rejects a long name, long code and long setting value", () => {
    expect(createNotificationModelSchema.safeParse({ name: "a".repeat(81) }).success).toBe(false);
    expect(createNotificationModelSchema.safeParse({ name: "a", code: "x".repeat(20001) }).success).toBe(false);
    expect(createNotificationModelSchema.safeParse({ name: "a", settings: { k: "x".repeat(501) } }).success).toBe(false);
  });
});

describe("visibility writes", () => {
  it("accepts private and rejects public with the publish hint on create and update", () => {
    expect(updateNotificationModelSchema.safeParse({ visibility: "private" }).success).toBe(true);
    for (const result of [
      updateNotificationModelSchema.safeParse({ visibility: "public" }),
      createNotificationModelSchema.safeParse({ name: "a", visibility: "public" })
    ]) {
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain("Use Publish to make a model public");
    }
  });
});

describe("notificationTestSchema", () => {
  it("requires non-empty text of at most 4000 characters", () => {
    expect(notificationTestSchema.safeParse({ text: "" }).success).toBe(false);
    expect(notificationTestSchema.safeParse({ text: "x".repeat(4001) }).success).toBe(false);
    expect(notificationTestSchema.safeParse({ text: "hi", code: "def process(): pass" }).success).toBe(true);
  });
});

describe("notificationIngestSchema", () => {
  it("accepts only text", () => {
    expect(notificationIngestSchema.safeParse({ text: "hi" }).success).toBe(true);
    expect(notificationIngestSchema.safeParse({ text: "hi", title: "x" }).success).toBe(false);
  });
});

describe("notificationProposalSchema", () => {
  const expense = { kind: "expense", name: "OXXO", amount: "1234.50", currency: "MXN", account: "card" };

  it("accepts an expense and a skip", () => {
    expect(notificationProposalSchema.safeParse(expense).success).toBe(true);
    expect(notificationProposalSchema.safeParse({ kind: "skip", reason: "promotion" }).success).toBe(true);
  });

  it("rejects a float amount", () => {
    expect(notificationProposalSchema.safeParse({ ...expense, amount: 12.5 }).success).toBe(false);
  });

  it.each(["expense", "income"])("accepts a %s with only amount and name", (kind) => {
    const parsed = notificationProposalSchema.safeParse({ kind, name: "OXXO", amount: "1234.50" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ kind, name: "OXXO", amount: "1234.50" });
  });

  it("accepts an expense with a currency but no account or category", () => {
    expect(notificationProposalSchema.safeParse({ kind: "expense", name: "X", amount: "1.00", currency: "usd" }).success).toBe(true);
  });

  it("still requires amount and name, and both accounts for a transfer", () => {
    expect(notificationProposalSchema.safeParse({ kind: "expense", name: "X" }).success).toBe(false);
    expect(notificationProposalSchema.safeParse({ kind: "income", amount: "1.00" }).success).toBe(false);
    const base = { kind: "transfer", name: "T", amount: "1.00" };
    expect(notificationProposalSchema.safeParse({ ...base, to_account: "b" }).success).toBe(false);
    expect(notificationProposalSchema.safeParse({ ...base, account: "a" }).success).toBe(false);
    expect(notificationProposalSchema.safeParse({ ...base, account: "a", to_account: "b" }).success).toBe(true);
  });

  it("requires to_account for a transfer", () => {
    const transfer = { ...expense, kind: "transfer" };
    expect(notificationProposalSchema.safeParse(transfer).success).toBe(false);
    expect(notificationProposalSchema.safeParse({ ...transfer, to_account: "savings" }).success).toBe(true);
  });

  it("limits the skip reason to 200 characters", () => {
    expect(notificationProposalSchema.safeParse({ kind: "skip", reason: "x".repeat(201) }).success).toBe(false);
  });
});

describe("updateFromSourceSchema", () => {
  it("requires a versionId", () => {
    expect(updateFromSourceSchema.safeParse({}).success).toBe(false);
    expect(updateFromSourceSchema.safeParse({ versionId: "v1", bindings: { card: "a1" } }).success).toBe(true);
  });
});

describe("validateNotificationCodeSchema and notificationListQuerySchema", () => {
  it("require code and accept an optional query", async () => {
    const { validateNotificationCodeSchema, notificationListQuerySchema } = await import("../notificationModels.js");
    expect(validateNotificationCodeSchema.safeParse({}).success).toBe(false);
    expect(validateNotificationCodeSchema.safeParse({ code: "x" }).success).toBe(true);
    expect(notificationListQuerySchema.safeParse({}).success).toBe(true);
  });
});

describe("notificationIdempotencyKeySchema", () => {
  it.each(["a", "a".repeat(128), " "])("accepts a valid key", (key) => {
    expect(notificationIdempotencyKeySchema.safeParse(key).success).toBe(true);
  });

  it.each(["", "a".repeat(129), undefined, null, 123])("rejects an invalid key", (key) => {
    expect(notificationIdempotencyKeySchema.safeParse(key).success).toBe(false);
  });
});
