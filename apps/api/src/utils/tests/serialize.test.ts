import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { publicUser, serialize } from "../serialize.js";

describe("serialize", () => {
  it("converts a Prisma Decimal to a plain number", () => {
    const result = serialize({ amount: new Prisma.Decimal("42.50") });
    expect(result).toEqual({ amount: 42.5 });
    expect(typeof result.amount).toBe("number");
  });

  it("converts nested Decimals inside arrays and objects", () => {
    const result = serialize({
      transactions: [
        { amount: new Prisma.Decimal("10") },
        { amount: new Prisma.Decimal("-5.25") }
      ]
    });
    expect(result).toEqual({
      transactions: [{ amount: 10 }, { amount: -5.25 }]
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
      amount: 10
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
});
