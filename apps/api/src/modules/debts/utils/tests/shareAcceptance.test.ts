import { describe, expect, it } from "vitest";
import { isCountedShare } from "../shareAcceptance.js";

describe("isCountedShare", () => {
  it("counts only accepted shares", () => {
    expect(isCountedShare({ acceptance: "accepted" })).toBe(true);
    expect(isCountedShare({ acceptance: "proposed" })).toBe(false);
    expect(isCountedShare({ acceptance: "rejected" })).toBe(false);
  });
});
