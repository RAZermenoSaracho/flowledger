import { describe, expect, it } from "vitest";
import {
  billingDatesExample,
  periodStatusClass,
  periodStatusLabel
} from "../creditCardDisplay";

describe("credit card display", () => {
  it("labels statuses", () => {
    expect(periodStatusLabel("partially_paid")).toBe("Partially paid");
    expect(periodStatusLabel("paid_late")).toBe("Paid late");
  });

  it("labels an older overdue period as carried into later periods", () => {
    expect(periodStatusLabel("overdue", true)).toBe(
      "Overdue (carried into later periods)"
    );
    expect(periodStatusLabel("overdue", false)).toBe("Overdue");
  });

  it("highlights the current overdue period but mutes carried ones", () => {
    expect(periodStatusClass("overdue")).toContain("text-red-600");
    expect(periodStatusClass("overdue", true)).not.toContain("text-red-600");
  });
});

describe("billingDatesExample", () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const run = (
    input: Partial<Parameters<typeof billingDatesExample>[0]> & { today: Date }
  ) => {
    const r = billingDatesExample({
      closingDay: 20,
      rule: "days_after_closing",
      value: 10,
      maxValue: 28,
      ...input
    });
    return r && { closing: iso(r.closing), due: iso(r.due), days: r.days };
  };

  it("adds calendar days after this month's closing", () => {
    expect(run({ today: new Date(2027, 0, 5) })).toEqual({
      closing: "2027-01-20",
      due: "2027-01-30",
      days: 10
    });
  });

  it("uses a fixed day of the following month", () => {
    expect(
      run({ today: new Date(2027, 0, 5), rule: "day_of_next_month", value: 15 })
    ).toEqual({
      closing: "2027-01-20",
      due: "2027-02-15",
      days: 26
    });
  });

  it("treats today as still open on the closing day but rolls to next month after it", () => {
    expect(run({ today: new Date(2027, 0, 20) })?.closing).toBe("2027-01-20");
    expect(run({ today: new Date(2027, 0, 21) })?.closing).toBe("2027-02-20");
  });

  it("rolls December into January of the next year", () => {
    expect(
      run({
        today: new Date(2026, 11, 25),
        rule: "day_of_next_month",
        value: 15
      })
    ).toEqual({
      closing: "2027-01-20",
      due: "2027-02-15",
      days: 26
    });
    expect(
      run({
        today: new Date(2026, 11, 5),
        rule: "day_of_next_month",
        value: 15
      })
    ).toMatchObject({
      closing: "2026-12-20",
      due: "2027-01-15"
    });
  });

  it("clamps closing day 31 to the end of February, leap or not", () => {
    expect(run({ today: new Date(2027, 1, 10), closingDay: 31 })?.closing).toBe(
      "2027-02-28"
    );
    expect(run({ today: new Date(2028, 1, 10), closingDay: 31 })?.closing).toBe(
      "2028-02-29"
    );
  });

  it("clamps a fixed due day to the following month's length", () => {
    expect(
      run({
        today: new Date(2027, 0, 5),
        closingDay: 31,
        rule: "day_of_next_month",
        value: 31,
        maxValue: 31
      })
    ).toMatchObject({
      closing: "2027-01-31",
      due: "2027-02-28"
    });
  });

  it("returns null for incomplete or out-of-range input", () => {
    const today = new Date(2027, 0, 5);
    expect(run({ today, rule: "" })).toBeNull();
    expect(run({ today, closingDay: NaN })).toBeNull();
    expect(run({ today, closingDay: 32 })).toBeNull();
    expect(run({ today, value: 0 })).toBeNull();
    expect(run({ today, value: 29 })).toBeNull();
    expect(run({ today, value: 1.5 })).toBeNull();
  });
});
