import { describe, expect, it } from "vitest";
import {
  categoriesQueryParamSchema,
  categorySchema,
  updateCategorySchema
} from "../categories.js";

describe("categorySchema", () => {
  it("accepts a valid expense category", () => {
    expect(
      categorySchema.safeParse({ name: "Groceries", type: "expense" }).success
    ).toBe(true);
  });

  it("accepts a null color", () => {
    expect(
      categorySchema.safeParse({ name: "Groceries", type: "expense", color: null })
        .success
    ).toBe(true);
  });

  it("rejects an unknown category type", () => {
    expect(
      categorySchema.safeParse({ name: "Groceries", type: "transfer" }).success
    ).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(categorySchema.safeParse({ name: "", type: "expense" }).success).toBe(
      false
    );
  });
});

describe("categoriesQueryParamSchema", () => {
  it("accepts an empty object", () => {
    expect(categoriesQueryParamSchema.safeParse({}).success).toBe(true);
  });

  it("accepts scope 'all'", () => {
    expect(categoriesQueryParamSchema.safeParse({ scope: "all" }).success).toBe(
      true
    );
  });

  it("rejects an unknown scope", () => {
    expect(categoriesQueryParamSchema.safeParse({ scope: "mine" }).success).toBe(
      false
    );
  });
});

describe("updateCategorySchema", () => {
  it("accepts a single-field update", () => {
    expect(updateCategorySchema.safeParse({ name: "Renamed" }).success).toBe(
      true
    );
  });

  it("rejects an empty object", () => {
    expect(updateCategorySchema.safeParse({}).success).toBe(false);
  });
});
