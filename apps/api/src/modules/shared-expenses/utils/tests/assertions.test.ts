import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assertShareableTransaction,
  validateSharedExpenseParticipants
} from "../assertions.js";

describe("assertShareableTransaction", () => {
  it("does not throw for an expense transaction", () => {
    expect(() => assertShareableTransaction({ type: "expense" })).not.toThrow();
  });

  it("does not throw for an income transaction", () => {
    expect(() => assertShareableTransaction({ type: "income" })).not.toThrow();
  });

  it("throws a 400 for a transfer transaction", () => {
    expect(() => assertShareableTransaction({ type: "transfer" })).toThrow(
      "Shared transactions are only supported for income and expense transactions"
    );
  });
});

describe("validateSharedExpenseParticipants", () => {
  it("does not throw when shares sum to exactly the total amount", () => {
    expect(() =>
      validateSharedExpenseParticipants(new Prisma.Decimal("100"), [
        { shareAmount: 60 } as never,
        { shareAmount: 40 } as never
      ])
    ).not.toThrow();
  });

  it("does not throw when shares sum to less than the total amount", () => {
    expect(() =>
      validateSharedExpenseParticipants(new Prisma.Decimal("100"), [
        { shareAmount: 30 } as never
      ])
    ).not.toThrow();
  });

  it("throws a 400 when shares exceed the total amount", () => {
    expect(() =>
      validateSharedExpenseParticipants(new Prisma.Decimal("100"), [
        { shareAmount: 60 } as never,
        { shareAmount: 60 } as never
      ])
    ).toThrow("Participant shares cannot exceed the transaction amount");
  });
});
