import { describe, expect, it } from "vitest";
import {
  transactionSearchFilterSchema,
  transactionSummaryFilterSchema,
  updateTransactionToolSchema
} from "../mcp.js";

describe("transactionSearchFilterSchema", () => {
  it("applies paging defaults", () => {
    expect(transactionSearchFilterSchema.parse({})).toEqual({ page: 1, pageSize: 50 });
  });

  it("rejects pageSize above 100", () => {
    expect(transactionSearchFilterSchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(transactionSearchFilterSchema.safeParse({ dateFrom: "01/02/2024" }).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(transactionSearchFilterSchema.safeParse({ userId: "x" }).success).toBe(false);
  });

  it("accepts a full filter", () => {
    const filter = { dateFrom: "2024-01-01", dateTo: "2024-01-31", type: "expense", text: "coffee" };
    expect(transactionSearchFilterSchema.safeParse(filter).success).toBe(true);
  });
});

describe("transactionSummaryFilterSchema", () => {
  it("does not accept paging fields", () => {
    expect(transactionSummaryFilterSchema.safeParse({ page: 2 }).success).toBe(false);
  });
});

describe("updateTransactionToolSchema", () => {
  it("requires an id", () => {
    expect(updateTransactionToolSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(updateTransactionToolSchema.safeParse({ id: "t1", name: "x" }).success).toBe(true);
  });
});
