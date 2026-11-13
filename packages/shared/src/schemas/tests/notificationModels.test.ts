import { describe, expect, it } from "vitest";
import {
  createNotificationModelSchema,
  notificationIngestSchema,
  notificationProposalSchema,
  notificationSlotsSchema,
  notificationTestSchema,
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
