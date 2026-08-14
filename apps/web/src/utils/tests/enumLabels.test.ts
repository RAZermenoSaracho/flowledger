import { describe, expect, it } from "vitest";
import { formatEnumLabel } from "../enumLabels";

describe("formatEnumLabel", () => {
  it("capitalizes a single-word value", () => {
    expect(formatEnumLabel("income")).toBe("Income");
    expect(formatEnumLabel("expense")).toBe("Expense");
    expect(formatEnumLabel("transfer")).toBe("Transfer");
  });

  it("replaces underscores with spaces and capitalizes the first letter", () => {
    expect(formatEnumLabel("credit_card")).toBe("Credit card");
  });

  it("replaces every underscore, not just the first", () => {
    expect(formatEnumLabel("a_b_c")).toBe("A b c");
  });

  it("returns an empty string unchanged", () => {
    expect(formatEnumLabel("")).toBe("");
  });
});
