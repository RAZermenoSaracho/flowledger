import { describe, expect, it } from "vitest";
import {
  buildSharedExpenseSearchFields,
  SHARED_EXPENSE_DEFAULT_SEARCH_FIELD,
  SHARED_EXPENSE_GROUPABLE_FIELDS,
  SHARED_EXPENSE_SORTABLE_FIELDS
} from "../sharedExpenseSearchFields";

describe("buildSharedExpenseSearchFields", () => {
  it("includes title/totalAmount/status/createdAt/updatedAt fields", () => {
    const fields = buildSharedExpenseSearchFields();
    expect(fields.map((field) => field.name)).toEqual([
      "title",
      "totalAmount",
      "status",
      "createdAt",
      "updatedAt"
    ]);
  });

  it("populates the status field's options from SHARED_EXPENSE_STATUSES", () => {
    const statusField = buildSharedExpenseSearchFields().find(
      (field) => field.name === "status"
    );
    expect(statusField?.type).toBe("enum");
    expect(statusField?.options?.length).toBeGreaterThan(0);
  });
});

describe("shared expense search field constants", () => {
  it("exposes 'status' as a groupable field", () => {
    expect(SHARED_EXPENSE_GROUPABLE_FIELDS).toEqual([{ name: "status", label: "Status" }]);
  });

  it("exposes the expected sortable fields", () => {
    expect(SHARED_EXPENSE_SORTABLE_FIELDS.map((field) => field.name)).toEqual([
      "createdAt",
      "updatedAt",
      "title",
      "totalAmount",
      "status"
    ]);
  });

  it("targets 'title' as the default quick-search field", () => {
    expect(SHARED_EXPENSE_DEFAULT_SEARCH_FIELD).toBe("title");
  });
});
