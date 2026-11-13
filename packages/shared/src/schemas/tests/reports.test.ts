import { describe, expect, it } from "vitest";
import {
  financialOverviewQuerySchema,
  financialOverviewResponseSchema,
  reportFiltersSchema
} from "../reports.js";

describe("reportFiltersSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(reportFiltersSchema.safeParse({}).success).toBe(true);
  });

  it("accepts an IANA timeZone", () => {
    expect(
      reportFiltersSchema.parse({ timeZone: "America/Mexico_City" })
    ).toMatchObject({ timeZone: "America/Mexico_City" });
  });

  it("rejects an invalid timeZone", () => {
    expect(reportFiltersSchema.safeParse({ timeZone: "Not/AZone" }).success).toBe(false);
  });

  it("accepts datetimes with an offset as date bounds", () => {
    expect(
      reportFiltersSchema.safeParse({
        dateFrom: "2026-11-05T00:00:00-06:00",
        dateTo: "2026-11-06T06:00:00.000Z"
      }).success
    ).toBe(true);
  });

  it("normalizes a single groupId into groupIds array", () => {
    expect(reportFiltersSchema.parse({ groupIds: "group-1" })).toMatchObject({
      groupIds: ["group-1"]
    });
  });

  it("normalizes a categoryIds array of non-empty ids", () => {
    expect(
      reportFiltersSchema.parse({ categoryIds: ["cat-1", "cat-2"] })
    ).toMatchObject({ categoryIds: ["cat-1", "cat-2"] });
  });

  it("rejects a categoryIds array containing an empty string", () => {
    expect(
      reportFiltersSchema.safeParse({ categoryIds: ["cat-1", ""] }).success
    ).toBe(false);
  });

  it("accepts amountMode 'net' or 'gross'", () => {
    expect(reportFiltersSchema.safeParse({ amountMode: "net" }).success).toBe(
      true
    );
    expect(
      reportFiltersSchema.safeParse({ amountMode: "gross" }).success
    ).toBe(true);
  });

  it("rejects an unknown amountMode", () => {
    expect(
      reportFiltersSchema.safeParse({ amountMode: "average" }).success
    ).toBe(false);
  });

  it("rejects a malformed dateFrom", () => {
    expect(
      reportFiltersSchema.safeParse({ dateFrom: "not-a-date" }).success
    ).toBe(false);
  });
});

describe("financialOverviewQuerySchema", () => {
  it("accepts no timeZone or a valid one", () => {
    expect(financialOverviewQuerySchema.safeParse({}).success).toBe(true);
    expect(financialOverviewQuerySchema.safeParse({ timeZone: "America/Mexico_City" }).success).toBe(true);
  });

  it("rejects an invalid timeZone", () => {
    expect(financialOverviewQuerySchema.safeParse({ timeZone: "Not/AZone" }).success).toBe(false);
  });
});

describe("financialOverviewResponseSchema", () => {
  const netWorth = {
    status: "ok",
    total: 1150,
    accounts: 1000,
    owedToMe: 200,
    iOwe: 50,
    partial: false,
    excluded: [],
    awaitingAcceptance: 0
  };

  it("accepts a full response", () => {
    const parsed = financialOverviewResponseSchema.safeParse({
      currency: "USD",
      netWorth,
      savingsRate: { status: "ok", month: "2026-10", rate: 25, netIncome: 1000, netExpenses: 750 },
      disclosures: ["synced_balances"]
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an errored metric and a status-only savings rate", () => {
    const parsed = financialOverviewResponseSchema.safeParse({
      currency: "USD",
      netWorth: { status: "error" },
      savingsRate: { status: "no_data", month: "2026-10" },
      disclosures: []
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects the removed cross_currency_effects disclosure code", () => {
    const parsed = financialOverviewResponseSchema.safeParse({
      currency: "USD",
      netWorth,
      savingsRate: { status: "error" },
      disclosures: ["cross_currency_effects"]
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown disclosure code", () => {
    const parsed = financialOverviewResponseSchema.safeParse({
      currency: "USD",
      netWorth,
      savingsRate: { status: "error" },
      disclosures: ["bogus"]
    });
    expect(parsed.success).toBe(false);
  });
});
