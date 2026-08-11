import { describe, expect, it } from "vitest";
import {
  baseReportWhere,
  cashflowReportWhere,
  dateRangeWhere,
  offsetReportWhere,
  selectedCategoryIds,
  selectedGroupIds
} from "../reportFilters.js";

describe("dateRangeWhere", () => {
  it("returns null when neither bound is set", () => {
    expect(dateRangeWhere({})).toBeNull();
  });

  it("treats a bare YYYY-MM-DD dateTo as exclusive of the next day", () => {
    const result = dateRangeWhere({ dateTo: "2024-03-15" });
    expect(result?.lt).toEqual(new Date("2024-03-16"));
    expect(result).not.toHaveProperty("lte");
  });

  it("treats a full ISO datetime dateTo as an inclusive literal bound", () => {
    const result = dateRangeWhere({ dateTo: "2024-03-15T12:00:00.000Z" });
    expect(result?.lte).toEqual(new Date("2024-03-15T12:00:00.000Z"));
    expect(result).not.toHaveProperty("lt");
  });

  it("sets gte from dateFrom alone", () => {
    const result = dateRangeWhere({ dateFrom: "2024-01-01" });
    expect(result).toEqual({ gte: new Date("2024-01-01") });
  });

  it("sets both bounds when dateFrom and dateTo are given", () => {
    const result = dateRangeWhere({ dateFrom: "2024-01-01", dateTo: "2024-01-31" });
    expect(result?.gte).toEqual(new Date("2024-01-01"));
    expect(result?.lt).toEqual(new Date("2024-02-01"));
  });
});

describe("selectedGroupIds", () => {
  it("prefers the groupIds array when non-empty", () => {
    expect(
      selectedGroupIds({ groupIds: ["g1", "g2"], groupId: "g3" })
    ).toEqual(["g1", "g2"]);
  });

  it("falls back to the single legacy groupId", () => {
    expect(selectedGroupIds({ groupId: "g3" })).toEqual(["g3"]);
  });

  it("returns an empty array when neither is set", () => {
    expect(selectedGroupIds({})).toEqual([]);
  });

  it("falls back to groupId when groupIds is an empty array", () => {
    expect(selectedGroupIds({ groupIds: [], groupId: "g3" })).toEqual(["g3"]);
  });
});

describe("selectedCategoryIds", () => {
  it("prefers the categoryIds array when non-empty", () => {
    expect(
      selectedCategoryIds({ categoryIds: ["c1"], categoryId: "c2" })
    ).toEqual(["c1"]);
  });

  it("falls back to the single legacy categoryId", () => {
    expect(selectedCategoryIds({ categoryId: "c2" })).toEqual(["c2"]);
  });
});

describe("baseReportWhere", () => {
  it("scopes by userId alone when no filters are set", () => {
    expect(baseReportWhere("user-1", {})).toEqual({ userId: "user-1" });
  });

  it("adds groupId/categoryId/date clauses when filters are set", () => {
    const where = baseReportWhere("user-1", {
      groupIds: ["g1"],
      categoryIds: ["c1"],
      dateFrom: "2024-01-01"
    });

    expect(where).toEqual({
      userId: "user-1",
      groupId: { in: ["g1"] },
      categoryId: { in: ["c1"] },
      date: { gte: new Date("2024-01-01") }
    });
  });
});

describe("offsetReportWhere", () => {
  it("matches income transactions with any expenseOffsetCategoryId when no category filter is set", () => {
    const where = offsetReportWhere("user-1", {});
    expect(where).toEqual({
      userId: "user-1",
      type: "income",
      expenseOffsetCategoryId: { not: null }
    });
  });

  it("matches only the filtered categories' expenseOffsetCategoryId when categories are set", () => {
    const where = offsetReportWhere("user-1", { categoryIds: ["food"] });
    expect(where.expenseOffsetCategoryId).toEqual({ in: ["food"] });
  });
});

describe("cashflowReportWhere", () => {
  it("scopes to income/expense types (excludes transfers)", () => {
    const where = cashflowReportWhere("user-1", {});
    expect(where.type).toEqual({ in: ["income", "expense"] });
  });

  it("matches either the transaction's own category or its expense-offset category when filtered", () => {
    const where = cashflowReportWhere("user-1", { categoryIds: ["food"] });
    expect(where.OR).toEqual([
      { categoryId: { in: ["food"] } },
      { expenseOffsetCategoryId: { in: ["food"] } }
    ]);
  });

  it("omits the OR clause when no category filter is set", () => {
    const where = cashflowReportWhere("user-1", {});
    expect(where).not.toHaveProperty("OR");
  });
});
