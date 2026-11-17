import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  accountSchema,
  creditCardBillingQuerySchema,
  accountBaseSchema,
  accountsQueryParamSchema,
  holdingsChangeSetSchema,
  holdingUpsertSchema,
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
    expect(accountSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects an unknown account type", () => {
    expect(
      accountSchema.safeParse({ ...valid, type: "bitcoin_wallet" }).success
    ).toBe(false);
  });

  it("keeps a decimal-string initialBalance unchanged", () => {
    expect(
      accountSchema.parse({ ...valid, initialBalance: "150.5" })
    ).toMatchObject({ initialBalance: "150.5" });
  });

  it("rejects a numeric initialBalance", () => {
    expect(
      accountSchema.safeParse({ ...valid, initialBalance: 150.5 }).success
    ).toBe(false);
  });

  it("accepts a null identifier", () => {
    expect(
      accountSchema.safeParse({ ...valid, identifier: null }).success
    ).toBe(true);
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
    expect(accountsQueryParamSchema.safeParse({ query: "{}" }).success).toBe(
      true
    );
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
    return result.success
      ? []
      : result.error.issues.map((i) => i.path.join("."));
  };

  it("accepts a fully configured card and a card with no cycle", () => {
    expect(accountSchema.safeParse(card).success).toBe(true);
    expect(
      accountSchema.safeParse({ name: "Visa", type: "credit_card" }).success
    ).toBe(true);
  });

  it("rejects card fields on a non-card account, naming the field", () => {
    expect(issuePaths({ ...card, type: "checking" })).toContain("creditLimit");
    expect(
      issuePaths({ name: "C", type: "cash", billingTimeZone: "UTC" })
    ).toEqual(["billingTimeZone"]);
  });

  it("rejects a partial cycle", () => {
    expect(issuePaths({ ...card, billingTimeZone: undefined })).toEqual([
      "billingTimeZone"
    ]);
  });

  it("rejects a due day after the closing day, and days_after_closing above 28", () => {
    expect(issuePaths({ ...card, paymentDueValue: 25 })).toEqual([
      "paymentDueValue"
    ]);
    expect(
      issuePaths({
        ...card,
        paymentDueRule: "days_after_closing",
        paymentDueValue: 35
      })
    ).toEqual(["paymentDueValue"]);
    expect(
      accountSchema.safeParse({
        ...card,
        paymentDueRule: "days_after_closing",
        paymentDueValue: 25
      }).success
    ).toBe(true);
  });

  const messageAt = (input: unknown, path: string) => {
    const result = accountSchema.safeParse(input);
    return result.success
      ? undefined
      : result.error.issues.find((i) => i.path.join(".") === path)?.message;
  };

  it("accepts a fixed due day equal to the closing day and rejects one above it", () => {
    expect(
      accountSchema.safeParse({ ...card, paymentDueValue: 20 }).success
    ).toBe(true);
    expect(
      messageAt({ ...card, paymentDueValue: 21 }, "paymentDueValue")
    ).toMatch(/With a closing day of 20, the due day can be at most 20/);
  });

  it("accepts 28 days after closing and rejects 29 with the day-limit message", () => {
    const rule = { ...card, paymentDueRule: "days_after_closing" as const };
    expect(
      accountSchema.safeParse({ ...rule, paymentDueValue: 28 }).success
    ).toBe(true);
    expect(
      messageAt({ ...rule, paymentDueValue: 29 }, "paymentDueValue")
    ).toMatch(/at most 28 days after closing/);
  });

  it("explains that the cycle fields are all-or-none", () => {
    expect(
      messageAt({ ...card, billingTimeZone: undefined }, "billingTimeZone")
    ).toMatch(/together, or leave all of them empty/);
  });

  it("rejects a bad time zone, out-of-range closing day and rate", () => {
    expect(issuePaths({ ...card, billingTimeZone: "Mars/Base" })).toContain(
      "billingTimeZone"
    );
    expect(issuePaths({ ...card, statementClosingDay: 32 })).toContain(
      "statementClosingDay"
    );
    expect(issuePaths({ ...card, annualInterestRate: "1001" })).toContain(
      "annualInterestRate"
    );
  });

  it("keeps the flat base shape for MCP and a partial update schema", () => {
    expect(Object.keys(accountBaseSchema.shape)).toContain("creditLimit");
    expect(updateAccountSchema.safeParse({ creditLimit: "10" }).success).toBe(
      true
    );
  });

  it("refineCreditCardAccount validates a merged object", () => {
    const schema = z
      .object({})
      .passthrough()
      .superRefine(refineCreditCardAccount);
    expect(
      schema.safeParse({ type: "savings", creditLimit: "5" }).success
    ).toBe(false);
  });
});

describe("creditCardBillingQuerySchema", () => {
  it("defaults page to 1 and rejects 0", () => {
    expect(creditCardBillingQuerySchema.parse({}).page).toBe(1);
    expect(creditCardBillingQuerySchema.parse({ page: "3" }).page).toBe(3);
    expect(creditCardBillingQuerySchema.safeParse({ page: "0" }).success).toBe(
      false
    );
  });
});

describe("holdingUpsertSchema", () => {
  const create = { kind: "crypto", code: "btc", quantity: "0.5" };

  it("accepts a valid create (upper-casing the code) and a valid update", () => {
    const created = holdingUpsertSchema.safeParse(create);
    expect(created.success && created.data.code).toBe("BTC");
    expect(holdingUpsertSchema.safeParse({ id: "h1", quantity: "2" }).success).toBe(true);
    expect(
      holdingUpsertSchema.safeParse({ id: "h1", manualUnitPrice: "55000", manualPriceCurrency: "USD" }).success
    ).toBe(true);
    expect(holdingUpsertSchema.safeParse({ id: "h1", manualUnitPrice: null }).success).toBe(true);
  });

  it("requires kind, code and quantity on a create", () => {
    expect(holdingUpsertSchema.safeParse({ code: "BTC", quantity: "1" }).success).toBe(false);
    expect(holdingUpsertSchema.safeParse({ kind: "crypto", quantity: "1" }).success).toBe(false);
    expect(holdingUpsertSchema.safeParse({ kind: "crypto", code: "BTC" }).success).toBe(false);
  });

  it("rejects kind or code on an update", () => {
    expect(holdingUpsertSchema.safeParse({ id: "h1", kind: "crypto" }).success).toBe(false);
    expect(holdingUpsertSchema.safeParse({ id: "h1", code: "ETH" }).success).toBe(false);
  });

  it("requires an ISO 4217 code for fiat", () => {
    expect(holdingUpsertSchema.safeParse({ kind: "fiat", code: "USD", quantity: "5" }).success).toBe(true);
    expect(holdingUpsertSchema.safeParse({ kind: "fiat", code: "BTC", quantity: "5" }).success).toBe(false);
  });

  it("limits fiat to the currency's minor units and crypto to 18 decimals", () => {
    expect(holdingUpsertSchema.safeParse({ kind: "fiat", code: "USD", quantity: "10.005" }).success).toBe(false);
    expect(holdingUpsertSchema.safeParse({ kind: "fiat", code: "USD", quantity: "10.01" }).success).toBe(true);
    expect(holdingUpsertSchema.safeParse({ kind: "fiat", code: "JPY", quantity: "10.5" }).success).toBe(false);
    expect(holdingUpsertSchema.safeParse({ ...create, quantity: "1.123456789012345678" }).success).toBe(true);
    expect(holdingUpsertSchema.safeParse({ ...create, quantity: "1.1234567890123456789" }).success).toBe(false);
  });

  it("rejects zero, negative and numeric quantities", () => {
    for (const quantity of ["0", "-1", 1]) {
      expect(holdingUpsertSchema.safeParse({ ...create, quantity }).success).toBe(false);
    }
  });

  it("rejects a manual price on fiat and a price without its currency", () => {
    expect(
      holdingUpsertSchema.safeParse({ kind: "fiat", code: "USD", quantity: "1", manualUnitPrice: "2", manualPriceCurrency: "USD" }).success
    ).toBe(false);
    expect(holdingUpsertSchema.safeParse({ ...create, manualUnitPrice: "2" }).success).toBe(false);
  });

  it("rejects a future manualPricedAt but accepts a past one", () => {
    const price = { ...create, manualUnitPrice: "2", manualPriceCurrency: "USD" };
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(holdingUpsertSchema.safeParse({ ...price, manualPricedAt: future }).success).toBe(false);
    expect(holdingUpsertSchema.safeParse({ ...price, manualPricedAt: "2020-01-01T00:00:00Z" }).success).toBe(true);
  });
});

describe("holdingsChangeSetSchema", () => {
  it("defaults the missing side to an empty list and rejects an empty change set", () => {
    const parsed = holdingsChangeSetSchema.safeParse({ remove: ["h1"] });
    expect(parsed.success && parsed.data).toEqual({ upsert: [], remove: ["h1"] });
    expect(holdingsChangeSetSchema.safeParse({}).success).toBe(false);
    expect(holdingsChangeSetSchema.safeParse({ upsert: [], remove: [] }).success).toBe(false);
  });

  it("rejects the whole change set when one item is invalid", () => {
    expect(
      holdingsChangeSetSchema.safeParse({
        upsert: [{ id: "h1", quantity: "1" }, { kind: "fiat", code: "USD", quantity: "1.001" }]
      }).success
    ).toBe(false);
  });
});

describe("revised holding instruments", () => {
  const price = { quantity: "1", manualUnitPrice: "10", manualPriceCurrency: "USD" };
  it("requires an other name and forbids its code", () => {
    expect(holdingUpsertSchema.safeParse({ ...price, kind: "other" }).success).toBe(false);
    expect(holdingUpsertSchema.safeParse({ ...price, kind: "other", name: "Gold", code: "XAU" }).success).toBe(false);
    expect(holdingUpsertSchema.safeParse({ ...price, kind: "other", name: "Gold", unit: "oz" }).success).toBe(true);
  });
  it("rejects fiat codes as crypto and accepts USDT", () => {
    expect(holdingUpsertSchema.safeParse({ kind: "crypto", code: "USD", quantity: "1" }).success).toBe(false);
    expect(holdingUpsertSchema.safeParse({ kind: "crypto", code: "USDT", quantity: "1" }).success).toBe(true);
  });
  it.each(["stock", "etf"])("validates %s tickers and requires a manual price", (kind) => {
    expect(holdingUpsertSchema.safeParse({ ...price, kind, code: "BRK.B" }).success).toBe(true);
    expect(holdingUpsertSchema.safeParse({ ...price, kind, code: "BAD/TICKER" }).success).toBe(false);
    expect(holdingUpsertSchema.safeParse({ quantity: "1", kind, code: "AAPL" }).success).toBe(false);
    expect(holdingUpsertSchema.safeParse({ ...price, kind, code: "AAPL", unit: "shares" }).success).toBe(false);
  });
});
