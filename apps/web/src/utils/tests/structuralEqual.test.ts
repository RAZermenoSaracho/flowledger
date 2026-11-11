import { describe, expect, it } from "vitest";
import { structuralEqual } from "../structuralEqual";

describe("structuralEqual", () => {
  it("compares primitives, arrays and nested objects by content", () => {
    expect(structuralEqual(1, 1)).toBe(true);
    expect(structuralEqual([{ a: [1, 2] }], [{ a: [1, 2] }])).toBe(true);
    expect(structuralEqual([{ a: [1, 2] }], [{ a: [1, 3] }])).toBe(false);
    expect(structuralEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(structuralEqual({ a: undefined }, { b: undefined })).toBe(false);
    expect(structuralEqual([1], [1, 2])).toBe(false);
    expect(structuralEqual(null, {})).toBe(false);
  });

  it("compares dates by time and other objects by identity", () => {
    expect(structuralEqual(new Date(5), new Date(5))).toBe(true);
    expect(structuralEqual(new Date(5), new Date(6))).toBe(false);
    const file = new File(["x"], "a.png");
    expect(structuralEqual(file, file)).toBe(true);
    expect(structuralEqual(file, new File(["x"], "a.png"))).toBe(false);
  });
});
