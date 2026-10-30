import { describe, expect, it } from "vitest";
import {
  exchangeRateToolSchema,
  importedIdsToolSchema,
  importImportedToolSchema,
  markNotificationsReadInputSchema,
  publicBatchImportedSchema,
  publicBatchImportImportedSchema,
  updateImportedToolSchema,
  getReportToolSchema,
  listImportedToolSchema,
  optionalIdToolSchema,
  removeGroupMemberToolSchema,
  requestSettlementToolSchema,
  updateGroupToolSchema,
  setArchivedToolSchema,
  transactionIdToolSchema,
  updateAccountToolSchema,
  updateCategoryToolSchema,
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

describe("personal CRUD tool schemas", () => {
  it("getReportToolSchema requires a known type and accepts report filters", () => {
    expect(getReportToolSchema.safeParse({}).success).toBe(false);
    expect(getReportToolSchema.safeParse({ type: "bogus" }).success).toBe(false);
    expect(getReportToolSchema.parse({ type: "summary", dateFrom: "2024-01-01", currency: "USD" })).toMatchObject({
      type: "summary",
      currency: "USD"
    });
  });

  it("exchangeRateToolSchema rejects unknown keys", () => {
    expect(exchangeRateToolSchema.safeParse({ from: "USD", to: "MXN" }).success).toBe(true);
    expect(exchangeRateToolSchema.safeParse({ from: "USD", to: "MXN", x: 1 }).success).toBe(false);
  });

  it("listImportedToolSchema accepts an optional known status only", () => {
    expect(listImportedToolSchema.safeParse({}).success).toBe(true);
    expect(listImportedToolSchema.safeParse({ status: "pending" }).success).toBe(true);
    expect(listImportedToolSchema.safeParse({ status: "nope" }).success).toBe(false);
  });

  it("setArchivedToolSchema requires archived and rejects unknown keys", () => {
    expect(setArchivedToolSchema.safeParse({ id: "a" }).success).toBe(false);
    expect(setArchivedToolSchema.safeParse({ id: "a", archived: true, userId: "u" }).success).toBe(false);
    expect(setArchivedToolSchema.safeParse({ id: "a", archived: false }).success).toBe(true);
  });

  it("transactionIdToolSchema requires only an id", () => {
    expect(transactionIdToolSchema.safeParse({ id: "t" }).success).toBe(true);
    expect(transactionIdToolSchema.safeParse({ id: "t", userId: "u" }).success).toBe(false);
  });

  it("update tool schemas require an id and strip nothing else", () => {
    expect(updateAccountToolSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(updateAccountToolSchema.parse({ id: "a", name: "x" })).toEqual({ id: "a", name: "x" });
    expect(updateCategoryToolSchema.parse({ id: "c", color: null })).toEqual({ id: "c", color: null });
  });
});

describe("group CRUD tool schemas", () => {
  it("updateGroupToolSchema requires an id and keeps only group fields", () => {
    expect(updateGroupToolSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(updateGroupToolSchema.parse({ id: "g", name: "x", role: "admin" })).toEqual({ id: "g", name: "x" });
  });

  it("removeGroupMemberToolSchema treats userId as optional and rejects unknown keys", () => {
    expect(removeGroupMemberToolSchema.safeParse({ groupId: "g" }).success).toBe(true);
    expect(removeGroupMemberToolSchema.safeParse({ groupId: "g", userId: "u" }).success).toBe(true);
    expect(removeGroupMemberToolSchema.safeParse({ userId: "u" }).success).toBe(false);
    expect(removeGroupMemberToolSchema.safeParse({ groupId: "g", role: "admin" }).success).toBe(false);
  });

  it("requestSettlementToolSchema needs the debt id and the settlement request fields", () => {
    const valid = { debtId: "d", amount: 5, accountId: "a", categoryId: "c" };
    expect(requestSettlementToolSchema.safeParse(valid).success).toBe(true);
    expect(requestSettlementToolSchema.safeParse({ ...valid, debtId: undefined }).success).toBe(false);
    expect(requestSettlementToolSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
  });

  it("optionalIdToolSchema accepts no id or one id and rejects unknown keys", () => {
    expect(optionalIdToolSchema.safeParse({}).success).toBe(true);
    expect(optionalIdToolSchema.safeParse({ id: "g" }).success).toBe(true);
    expect(optionalIdToolSchema.safeParse({ id: "" }).success).toBe(false);
    expect(optionalIdToolSchema.safeParse({ id: "g", x: 1 }).success).toBe(false);
  });
});

describe("imported review schemas", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));

  it("accepts 1 to 50 ids in ids mode and rejects 0, 51 and the filtered mode", () => {
    expect(publicBatchImportedSchema.safeParse({ selection: { mode: "ids", ids: ids(50) } }).success).toBe(true);
    expect(publicBatchImportedSchema.safeParse({ selection: { mode: "ids", ids: [] } }).success).toBe(false);
    expect(publicBatchImportedSchema.safeParse({ selection: { mode: "ids", ids: ids(51) } }).success).toBe(false);
    expect(publicBatchImportedSchema.safeParse({ selection: { mode: "filtered" } }).success).toBe(false);
  });

  it("batch import also takes an optional categoryId", () => {
    expect(publicBatchImportImportedSchema.parse({ selection: { mode: "ids", ids: ["a"] }, categoryId: "c" }).categoryId).toBe("c");
  });

  it("tool schemas cap ids at 50 and reject unknown keys", () => {
    expect(importedIdsToolSchema.safeParse({ ids: ids(51) }).success).toBe(false);
    expect(importedIdsToolSchema.safeParse({ ids: ["a"], x: 1 }).success).toBe(false);
    expect(importImportedToolSchema.safeParse({ ids: ["a"], categoryId: "c" }).success).toBe(true);
  });

  it("update_imported_transaction requires id and an explicit categoryId (null clears)", () => {
    expect(updateImportedToolSchema.safeParse({ id: "a", categoryId: null }).success).toBe(true);
    expect(updateImportedToolSchema.safeParse({ id: "a" }).success).toBe(false);
  });

  it("mark_notifications_read needs exactly one of id or all: true", () => {
    expect(markNotificationsReadInputSchema.safeParse({ id: "n" }).success).toBe(true);
    expect(markNotificationsReadInputSchema.safeParse({ all: true }).success).toBe(true);
    expect(markNotificationsReadInputSchema.safeParse({}).success).toBe(false);
    expect(markNotificationsReadInputSchema.safeParse({ id: "n", all: true }).success).toBe(false);
    expect(markNotificationsReadInputSchema.safeParse({ all: false }).success).toBe(false);
  });
});
