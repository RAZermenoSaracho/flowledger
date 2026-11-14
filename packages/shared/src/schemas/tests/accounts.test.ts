import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  accountSchema,
  creditCardBillingQuerySchema,
  accountBaseSchema,
  accountsQueryParamSchema,
  refineCreditCardAccount,
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
      initialBalance: "0"
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

  it("keeps a decimal-string initialBalance unchanged", () => {
    expect(accountSchema.parse({ ...valid, initialBalance: "150.5" })).toMatchObject(
      { initialBalance: "150.5" }
    );
  });

  it("rejects a numeric initialBalance", () => {
    expect(accountSchema.safeParse({ ...valid, initialBalance: 150.5 }).success).toBe(false);
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

describe("accountSchema credit-card fields", () => {
  const card = {
    name: "Visa",
    type: "credit_card" as const,
    creditLimit: "50000",
    statementClosingDay: 20,
    paymentDueRule: "day_of_next_month" as const,
    paymentDueValue: 10,
    billingTimeZone: "America/Mexico_City",
    annualInterestRate: "45.5"
  };
  const issuePaths = (input: unknown) => {
    const result = accountSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
  };

  it("accepts a fully configured card and a card with no cycle", () => {
    expect(accountSchema.safeParse(card).success).toBe(true);
    expect(accountSchema.safeParse({ name: "Visa", type: "credit_card" }).success).toBe(true);
  });

  it("rejects card fields on a non-card account, naming the field", () => {
    expect(issuePaths({ ...card, type: "checking" })).toContain("creditLimit");
    expect(issuePaths({ name: "C", type: "cash", billingTimeZone: "UTC" })).toEqual(["billingTimeZone"]);
  });

  it("rejects a partial cycle", () => {
    expect(issuePaths({ ...card, billingTimeZone: undefined })).toEqual(["billingTimeZone"]);
  });

  it("rejects a due day after the closing day, and days_after_closing above 28", () => {
    expect(issuePaths({ ...card, paymentDueValue: 25 })).toEqual(["paymentDueValue"]);
    expect(
      issuePaths({ ...card, paymentDueRule: "days_after_closing", paymentDueValue: 35 })
    ).toEqual(["paymentDueValue"]);
    expect(
      accountSchema.safeParse({ ...card, paymentDueRule: "days_after_closing", paymentDueValue: 25 }).success
    ).toBe(true);
  });

  it("rejects a bad time zone, out-of-range closing day and rate", () => {
    expect(issuePaths({ ...card, billingTimeZone: "Mars/Base" })).toContain("billingTimeZone");
    expect(issuePaths({ ...card, statementClosingDay: 32 })).toContain("statementClosingDay");
    expect(issuePaths({ ...card, annualInterestRate: "1001" })).toContain("annualInterestRate");
  });

  it("keeps the flat base shape for MCP and a partial update schema", () => {
    expect(Object.keys(accountBaseSchema.shape)).toContain("creditLimit");
    expect(updateAccountSchema.safeParse({ creditLimit: "10" }).success).toBe(true);
  });

  it("refineCreditCardAccount validates a merged object", () => {
    const schema = z.object({}).passthrough().superRefine(refineCreditCardAccount);
    expect(schema.safeParse({ type: "savings", creditLimit: "5" }).success).toBe(false);
  });
});

describe("creditCardBillingQuerySchema", () => {
  it("defaults page to 1 and rejects 0", () => {
    expect(creditCardBillingQuerySchema.parse({}).page).toBe(1);
    expect(creditCardBillingQuerySchema.parse({ page: "3" }).page).toBe(3);
    expect(creditCardBillingQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });
});
