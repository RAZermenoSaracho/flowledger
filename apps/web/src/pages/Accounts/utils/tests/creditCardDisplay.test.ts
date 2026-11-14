import { describe, expect, it } from "vitest";
import { periodStatusClass, periodStatusLabel } from "../creditCardDisplay";

describe("credit card display", () => {
  it("labels statuses", () => {
    expect(periodStatusLabel("partially_paid")).toBe("Partially paid");
    expect(periodStatusLabel("paid_late")).toBe("Paid late");
  });

  it("labels an older overdue period as carried into later periods", () => {
    expect(periodStatusLabel("overdue", true)).toBe("Overdue (carried into later periods)");
    expect(periodStatusLabel("overdue", false)).toBe("Overdue");
  });

  it("highlights the current overdue period but mutes carried ones", () => {
    expect(periodStatusClass("overdue")).toContain("text-red-600");
    expect(periodStatusClass("overdue", true)).not.toContain("text-red-600");
  });
});
