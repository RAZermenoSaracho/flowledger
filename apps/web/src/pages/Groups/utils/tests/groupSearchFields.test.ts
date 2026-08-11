import { describe, expect, it } from "vitest";
import {
  buildGroupSearchFields,
  GROUP_DEFAULT_SEARCH_FIELD,
  GROUP_GROUPABLE_FIELDS,
  GROUP_SORTABLE_FIELDS
} from "../groupSearchFields";

describe("buildGroupSearchFields", () => {
  it("includes name/description/createdAt/updatedAt/isArchived fields", () => {
    expect(buildGroupSearchFields().map((field) => field.name)).toEqual([
      "name",
      "description",
      "createdAt",
      "updatedAt",
      "isArchived"
    ]);
  });
});

describe("group search field constants", () => {
  it("has no groupable fields", () => {
    expect(GROUP_GROUPABLE_FIELDS).toEqual([]);
  });

  it("exposes name/createdAt/updatedAt as sortable fields", () => {
    expect(GROUP_SORTABLE_FIELDS.map((field) => field.name)).toEqual([
      "name",
      "createdAt",
      "updatedAt"
    ]);
  });

  it("targets 'name' as the default quick-search field", () => {
    expect(GROUP_DEFAULT_SEARCH_FIELD).toBe("name");
  });
});
