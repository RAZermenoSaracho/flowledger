import { describe, expect, it } from "vitest";
import {
  buildCategorySearchFields,
  CATEGORY_DEFAULT_SEARCH_FIELD,
  CATEGORY_GROUPABLE_FIELDS,
  CATEGORY_SORTABLE_FIELDS
} from "../categorySearchFields";

describe("buildCategorySearchFields", () => {
  it("includes name/type/createdAt/updatedAt/isArchived fields", () => {
    const fields = buildCategorySearchFields();
    expect(fields.map((field) => field.name)).toEqual([
      "name",
      "type",
      "createdAt",
      "updatedAt",
      "isArchived"
    ]);
  });

  it("populates the type field's options from CATEGORY_TYPES", () => {
    const typeField = buildCategorySearchFields().find((field) => field.name === "type");
    expect(typeField?.type).toBe("enum");
    expect(typeField?.options?.length).toBeGreaterThan(0);
  });
});

describe("category search field constants", () => {
  it("exposes 'type' as a groupable field", () => {
    expect(CATEGORY_GROUPABLE_FIELDS).toEqual([{ name: "type", label: "Type" }]);
  });

  it("exposes name/createdAt/updatedAt as sortable fields", () => {
    expect(CATEGORY_SORTABLE_FIELDS.map((field) => field.name)).toEqual([
      "name",
      "createdAt",
      "updatedAt"
    ]);
  });

  it("targets 'name' as the default quick-search field", () => {
    expect(CATEGORY_DEFAULT_SEARCH_FIELD).toBe("name");
  });
});
