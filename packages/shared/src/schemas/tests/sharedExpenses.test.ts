import { describe, expect, it } from "vitest";
import {
  sharedExpenseParticipantSchema,
  sharedExpenseSchema,
  sharedExpensesQueryParamSchema,
  updateSharedExpenseSchema
} from "../sharedExpenses.js";

describe("sharedExpenseParticipantSchema", () => {
  const valid = { participantName: "Sam", shareAmount: 25 };

  it("accepts a valid participant, defaulting paidAmount and status", () => {
    expect(sharedExpenseParticipantSchema.parse(valid)).toEqual({
      participantName: "Sam",
      shareAmount: 25,
      paidAmount: 0,
      status: "pending"
    });
  });

  it("rejects a zero shareAmount", () => {
    expect(
      sharedExpenseParticipantSchema.safeParse({ ...valid, shareAmount: 0 })
        .success
    ).toBe(false);
  });

  it("rejects a negative paidAmount", () => {
    expect(
      sharedExpenseParticipantSchema.safeParse({ ...valid, paidAmount: -1 })
        .success
    ).toBe(false);
  });

  it("accepts a null userId (manual participant)", () => {
    expect(
      sharedExpenseParticipantSchema.safeParse({ ...valid, userId: null })
        .success
    ).toBe(true);
  });
});

describe("sharedExpenseSchema", () => {
  const validParticipant = { participantName: "Sam", shareAmount: 25 };

  it("accepts a valid shared expense, defaulting status to 'open'", () => {
    const result = sharedExpenseSchema.parse({
      transactionId: "txn-1",
      title: "Dinner"
    });
    expect(result.status).toBe("open");
  });

  it("accepts an explicit participants array", () => {
    expect(
      sharedExpenseSchema.safeParse({
        transactionId: "txn-1",
        title: "Dinner",
        participants: [validParticipant]
      }).success
    ).toBe(true);
  });

  it("rejects an empty participants array when provided", () => {
    expect(
      sharedExpenseSchema.safeParse({
        transactionId: "txn-1",
        title: "Dinner",
        participants: []
      }).success
    ).toBe(false);
  });

  it("rejects a missing transactionId", () => {
    expect(
      sharedExpenseSchema.safeParse({ title: "Dinner" }).success
    ).toBe(false);
  });
});

describe("updateSharedExpenseSchema", () => {
  it("accepts a partial update with just a title", () => {
    expect(
      updateSharedExpenseSchema.safeParse({ title: "Renamed" }).success
    ).toBe(true);
  });

  it("accepts an empty participants array (unlike create)", () => {
    expect(
      updateSharedExpenseSchema.safeParse({ participants: [] }).success
    ).toBe(true);
  });
});

describe("sharedExpensesQueryParamSchema", () => {
  it("accepts an empty object", () => {
    expect(sharedExpensesQueryParamSchema.safeParse({}).success).toBe(true);
  });
});
