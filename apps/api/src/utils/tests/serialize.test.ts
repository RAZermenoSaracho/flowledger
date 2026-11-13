import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { publicUser, serialize } from "../serialize.js";

describe("serialize", () => {
  it("renders a Decimal under a native amount key as an exact string", () => {
    const result = serialize({ amount: new Prisma.Decimal("42.50") });
    expect(result).toEqual({ amount: "42.5" });
  });

  it("keeps every digit and never uses an exponent", () => {
    const result = serialize({
      amount: new Prisma.Decimal("0.000000000000000001"),
      accountAmount: new Prisma.Decimal("1.234567890123456789"),
      debtorAccountAmount: new Prisma.Decimal("7.25"),
      destinationAmount: new Prisma.Decimal("100000000000"),
      feeAmount: new Prisma.Decimal("0.5"),
      initialBalance: new Prisma.Decimal("-3"),
      currentBalance: new Prisma.Decimal("1e-18")
    });
    expect(result).toEqual({
      amount: "0.000000000000000001",
      accountAmount: "1.234567890123456789",
      debtorAccountAmount: "7.25",
      destinationAmount: "100000000000",
      feeAmount: "0.5",
      initialBalance: "-3",
      currentBalance: "0.000000000000000001"
    });
  });

  it("converts native keys nested inside arrays and objects", () => {
    const result = serialize({
      transactions: [
        { amount: new Prisma.Decimal("10") },
        { amount: new Prisma.Decimal("-5.25") }
      ]
    });
    expect(result).toEqual({
      transactions: [{ amount: "10" }, { amount: "-5.25" }]
    });
  });

  it("serializes share amounts exactly and preferred values and rates as numbers", () => {
    const result = serialize({
      amountInPreferredCurrency: new Prisma.Decimal("42.5"),
      shareAmount: new Prisma.Decimal("10"),
      exchangeRate: new Prisma.Decimal("17.25")
    });
    expect(result).toEqual({
      amountInPreferredCurrency: 42.5,
      shareAmount: "10",
      exchangeRate: 17.25
    });
  });

  it("leaves non-Decimal values unchanged", () => {
    const input = { name: "Groceries", count: 3, active: true, tag: null };
    expect(serialize(input)).toEqual(input);
  });

  it("leaves a Date alongside a sibling Decimal as an ISO string, not {}", () => {
    const result = serialize({
      createdAt: new Date("2024-01-15T00:00:00.000Z"),
      amount: new Prisma.Decimal("10")
    });
    expect(result).toEqual({
      createdAt: "2024-01-15T00:00:00.000Z",
      amount: "10"
    });
  });
});

describe("publicUser", () => {
  it("strips passwordHash off the user record", () => {
    const user = {
      id: "user-1",
      email: "user1@example.com",
      passwordHash: "hashed-secret"
    };

    const result = publicUser(user);

    expect(result).toEqual({ id: "user-1", email: "user1@example.com" });
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("handles a record with a null passwordHash", () => {
    const user = { id: "user-1", passwordHash: null };
    expect(publicUser(user)).toEqual({ id: "user-1" });
  });

  it("serializes share, paid, total, outstanding and pending-settlement amounts as exact strings but valuations as numbers", () => {
    const result = serialize({
      shareAmount: new Prisma.Decimal("1"),
      paidAmount: new Prisma.Decimal("0.4"),
      totalAmount: new Prisma.Decimal("0.010000000000000001"),
      outstandingAmount: new Prisma.Decimal("0.6"),
      pendingSettlementAmount: new Prisma.Decimal("0.2"),
      outstandingAmountInPreferredCurrency: new Prisma.Decimal("33.5"),
      amountInPreferredCurrency: new Prisma.Decimal("12.25")
    });
    expect(result).toEqual({
      shareAmount: "1",
      paidAmount: "0.4",
      totalAmount: "0.010000000000000001",
      outstandingAmount: "0.6",
      pendingSettlementAmount: "0.2",
      outstandingAmountInPreferredCurrency: 33.5,
      amountInPreferredCurrency: 12.25
    });
  });
});
