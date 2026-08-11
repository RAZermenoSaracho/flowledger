import { describe, expect, it } from "vitest";
import {
  accountSchema,
  accountsQueryParamSchema,
  updateAccountSchema
} from "../accounts.js";

describe("accountSchema", () => {
  const valid = { name: "Checking", type: "checking" as const };

  it("accepts a minimal valid account, defaulting currency and initialBalance", () => {
    const result = accountSchema.parse(valid);
    expect(result).toEqual({
      name: "Checking",
      type: "checking",
      currency: "USD",
      initialBalance: 0
    });
  });

  it("rejects an empty name", () => {
    expect(accountSchema.safeParse({ ...valid, name: "" }).success).toBe(
      false
    );
  });

  it("rejects an unknown account type", () => {
    expect(
      accountSchema.safeParse({ ...valid, type: "bitcoin_wallet" }).success
    ).toBe(false);
  });

  it("coerces a string initialBalance to a number", () => {
    expect(accountSchema.parse({ ...valid, initialBalance: "150.5" })).toMatchObject(
      { initialBalance: 150.5 }
    );
  });

  it("accepts a null identifier", () => {
    expect(accountSchema.safeParse({ ...valid, identifier: null }).success).toBe(
      true
    );
  });
});

describe("updateAccountSchema", () => {
  it("accepts a partial update with a single field", () => {
    expect(updateAccountSchema.safeParse({ name: "Renamed" }).success).toBe(
      true
    );
  });

  it("accepts an empty object (all fields optional)", () => {
    expect(updateAccountSchema.safeParse({}).success).toBe(true);
  });
});

describe("accountsQueryParamSchema", () => {
  it("accepts an empty object", () => {
    expect(accountsQueryParamSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a query string", () => {
    expect(
      accountsQueryParamSchema.safeParse({ query: "{}" }).success
    ).toBe(true);
  });

  it("rejects a query string over 4000 characters", () => {
    expect(
      accountsQueryParamSchema.safeParse({ query: "a".repeat(4001) }).success
    ).toBe(false);
  });
});
