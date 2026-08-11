import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DEFAULT_SEARCH_FIELD,
  ACCOUNT_GROUPABLE_FIELDS,
  ACCOUNT_SORTABLE_FIELDS,
  buildAccountSearchFields
} from "../accountSearchFields";

describe("buildAccountSearchFields", () => {
  it("includes every real Account field plus the virtual 'source' field", () => {
    expect(buildAccountSearchFields().map((field) => field.name)).toEqual([
      "name",
      "identifier",
      "currency",
      "initialBalance",
      "type",
      "createdAt",
      "updatedAt",
      "isArchived",
      "source"
    ]);
  });

  it("populates the type field's options from ACCOUNT_TYPES", () => {
    const typeField = buildAccountSearchFields().find((field) => field.name === "type");
    expect(typeField?.type).toBe("enum");
    expect(typeField?.options?.length).toBeGreaterThan(0);
  });

  it("gives the virtual 'source' field manual/synced options", () => {
    const sourceField = buildAccountSearchFields().find((field) => field.name === "source");
    expect(sourceField?.options).toEqual([
      { label: "Manual", value: "manual" },
      { label: "Synced", value: "synced" }
    ]);
  });
});

describe("account search field constants", () => {
  it("exposes 'type' and 'source' as groupable fields", () => {
    expect(ACCOUNT_GROUPABLE_FIELDS.map((field) => field.name)).toEqual(["type", "source"]);
  });

  it("exposes name/createdAt/updatedAt as sortable fields", () => {
    expect(ACCOUNT_SORTABLE_FIELDS.map((field) => field.name)).toEqual([
      "name",
      "createdAt",
      "updatedAt"
    ]);
  });

  it("targets 'name' as the default quick-search field", () => {
    expect(ACCOUNT_DEFAULT_SEARCH_FIELD).toBe("name");
  });
});
