import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assertAmountPrecision,
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
        { shareAmount: "60" },
        { shareAmount: "40" } as never
      ])
    ).not.toThrow();
  });

  it("does not throw when shares sum to less than the total amount", () => {
    expect(() =>
      validateSharedExpenseParticipants(new Prisma.Decimal("100"), [
        { shareAmount: "30" } as never
      ])
    ).not.toThrow();
  });

  it("throws a 400 when shares exceed the total amount", () => {
    expect(() =>
      validateSharedExpenseParticipants(new Prisma.Decimal("100"), [
        { shareAmount: "60" },
        { shareAmount: "60" }
      ])
    ).toThrow("Participant shares cannot exceed the transaction amount");
  });
});

describe("validateSharedExpenseParticipants exactness", () => {
  it("accepts ten 0.01 BTC shares against a 0.1 BTC total", () => {
    const shares = Array.from({ length: 10 }, () => ({ shareAmount: "0.01" }));
    expect(() => validateSharedExpenseParticipants(new Prisma.Decimal("0.1"), shares)).not.toThrow();
    expect(() => validateSharedExpenseParticipants(new Prisma.Decimal("0.099999999999999999"), shares)).toThrow();
  });
});

describe("assertAmountPrecision", () => {
  it("accepts amounts within the currency's minor units", () => {
    expect(() => assertAmountPrecision("1.50", "USD", "f")).not.toThrow();
    expect(() => assertAmountPrecision("0.123456789012345678", "BTC", "f")).not.toThrow();
  });

  it("throws a 400 on excess decimals", () => {
    expect(() => assertAmountPrecision("1.505", "USD", "f")).toThrow("more decimals than USD");
    expect(() => assertAmountPrecision("1.5", "JPY", "f")).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});
