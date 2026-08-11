import { describe, expect, it } from "vitest";
import { matchesSearch } from "../search";

describe("matchesSearch", () => {
  it("matches when the search term appears in any value, case-insensitively", () => {
    expect(matchesSearch(["Groceries", "Food"], "food")).toBe(true);
  });

  it("does not match when the search term appears in no value", () => {
    expect(matchesSearch(["Groceries", "Food"], "rent")).toBe(false);
  });

  it("treats null/undefined values as empty strings", () => {
    expect(matchesSearch([null, undefined, "Rent"], "rent")).toBe(true);
  });

  it("coerces numbers to strings for matching", () => {
    expect(matchesSearch([42, "Groceries"], "42")).toBe(true);
  });

  it("always matches when search is undefined", () => {
    expect(matchesSearch(["anything"], undefined)).toBe(true);
  });

  it("always matches when search is blank/whitespace-only", () => {
    expect(matchesSearch(["anything"], "   ")).toBe(true);
  });
});
