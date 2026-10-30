import { describe, expect, it } from "vitest";
import { capList } from "../listCap.js";

describe("capList", () => {
  it("returns all rows when under the cap", () => {
    expect(capList([1, 2], 3)).toEqual({ data: [1, 2], total: 2 });
  });

  it("returns all rows when equal to the cap", () => {
    expect(capList([1, 2, 3], 3)).toEqual({ data: [1, 2, 3], total: 3 });
  });

  it("truncates to the cap and reports the full total when over", () => {
    expect(capList([1, 2, 3, 4], 3)).toEqual({ data: [1, 2, 3], total: 4 });
  });

  it("handles an empty list", () => {
    expect(capList([], 3)).toEqual({ data: [], total: 0 });
  });
});
