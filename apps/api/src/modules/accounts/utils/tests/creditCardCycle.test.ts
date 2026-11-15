import { describe, expect, it } from "vitest";
import type { CycleConfig } from "../../types/creditCardBilling.types.js";
import {
  addDays,
  closingDateOf,
  daysBetween,
  dueDateOf,
  enumeratePeriodIndexes,
  formatLocalDate,
  localDateOf,
  monthIndexOf,
  periodBounds,
  periodIndexContaining,
  startOfLocalDay
} from "../creditCardCycle.js";

const mx = (over: Partial<CycleConfig> = {}): CycleConfig => ({
  statementClosingDay: 20,
  paymentDueRule: "day_of_next_month",
  paymentDueValue: 20,
  billingTimeZone: "America/Mexico_City",
  ...over
});
const idx = (y: number, m: number) => monthIndexOf({ y, m, d: 1 });
const fmt = (index: number, config = mx()) => {
  const b = periodBounds(config, index);
  return [
    formatLocalDate(b.start),
    formatLocalDate(b.closingDate),
    formatLocalDate(b.dueDate)
  ];
};

describe("closing and due dates", () => {
  it("closes on the 20th and is due on the 20th of the next month", () => {
    expect(fmt(idx(2026, 11))).toEqual([
      "2026-10-21",
      "2026-11-20",
      "2026-12-20"
    ]);
    expect(fmt(idx(2026, 12))).toEqual([
      "2026-11-21",
      "2026-12-20",
      "2027-01-20"
    ]);
  });

  it("clamps closing day 31 to the month's last day, including leap years", () => {
    const config = mx({ statementClosingDay: 31, paymentDueValue: 5 });
    const closings = [
      idx(2027, 1),
      idx(2027, 2),
      idx(2027, 3),
      idx(2028, 2)
    ].map((i) => formatLocalDate(closingDateOf(config, i)));
    expect(closings).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2028-02-29"
    ]);
    expect(fmt(idx(2027, 2), config)[0]).toBe("2027-02-01");
  });

  it("adds days_after_closing across a year boundary", () => {
    const config = mx({
      paymentDueRule: "days_after_closing",
      paymentDueValue: 20
    });
    expect(formatLocalDate(dueDateOf(config, idx(2026, 12)))).toBe(
      "2027-01-09"
    );
  });

  it("clamps day_of_next_month to a short month", () => {
    const config = mx({ statementClosingDay: 31, paymentDueValue: 30 });
    expect(formatLocalDate(dueDateOf(config, idx(2027, 1)))).toBe("2027-02-28");
  });

  it("computes the overdue example: closing 31, 20 days after", () => {
    const config = mx({
      statementClosingDay: 31,
      paymentDueRule: "days_after_closing",
      paymentDueValue: 20
    });
    expect(formatLocalDate(dueDateOf(config, idx(2027, 1)))).toBe("2027-02-20");
  });
});

describe("instants in the billing zone", () => {
  it("assigns 23:59 local on the closing day to the closing period and 00:00 next day to the next", () => {
    const config = mx();
    const before = new Date("2027-01-21T05:59:00Z");
    const after = new Date("2027-01-21T06:00:00Z");
    expect(periodIndexContaining(config, before)).toBe(idx(2027, 1));
    expect(periodIndexContaining(config, after)).toBe(idx(2027, 2));
    expect(periodBounds(config, idx(2027, 1)).closeInstant.toISOString()).toBe(
      "2027-01-21T06:00:00.000Z"
    );
  });

  it("resolves the DST-start closing period of America/New_York as 2027-02-15T05:00Z to 2027-03-15T04:00Z", () => {
    const config = mx({
      statementClosingDay: 14,
      paymentDueValue: 14,
      billingTimeZone: "America/New_York"
    });
    const bounds = periodBounds(config, idx(2027, 3));
    expect(bounds.startInstant.toISOString()).toBe("2027-02-15T05:00:00.000Z");
    expect(bounds.closeInstant.toISOString()).toBe("2027-03-15T04:00:00.000Z");
  });

  it("includes the whole due day: due boundary is the start of the next local day", () => {
    const bounds = periodBounds(mx(), idx(2026, 11));
    expect(formatLocalDate(bounds.dueDate)).toBe("2026-12-20");
    expect(bounds.dueInstant.toISOString()).toBe("2026-12-21T06:00:00.000Z");
  });

  it("classifies a bare-date 00:00Z transaction by its instant (previous local day in Mexico City)", () => {
    const bare = new Date("2027-01-21T00:00:00Z");
    expect(formatLocalDate(localDateOf(bare, "America/Mexico_City"))).toBe(
      "2027-01-20"
    );
    expect(periodIndexContaining(mx(), bare)).toBe(idx(2027, 1));
  });

  it("keeps payment windows contiguous: close(N+1) of one period is the start of the next", () => {
    const a = periodBounds(mx(), idx(2027, 1));
    const b = periodBounds(mx(), idx(2027, 2));
    expect(a.closeInstant.getTime()).toBe(b.startInstant.getTime());
    expect(a.dueInstant.getTime()).toBeLessThanOrEqual(
      b.closeInstant.getTime()
    );
  });

  it("starts the local day correctly for a positive-offset zone", () => {
    expect(
      startOfLocalDay({ y: 2027, m: 6, d: 1 }, "Asia/Tokyo").toISOString()
    ).toBe("2027-05-31T15:00:00.000Z");
  });
});

describe("enumeration and date helpers", () => {
  it("enumerates from the period of the earliest instant to the open period", () => {
    const list = enumeratePeriodIndexes(
      mx(),
      new Date("2026-10-25T12:00:00Z"),
      new Date("2027-01-10T12:00:00Z")
    );
    expect(list).toEqual([idx(2026, 11), idx(2026, 12), idx(2027, 1)]);
  });

  it("returns one period when both instants share a period", () => {
    const at = new Date("2027-01-10T12:00:00Z");
    expect(enumeratePeriodIndexes(mx(), at, at)).toEqual([idx(2027, 1)]);
  });

  it("adds and diffs local days across year and month boundaries", () => {
    expect(addDays({ y: 2026, m: 12, d: 31 }, 1)).toEqual({
      y: 2027,
      m: 1,
      d: 1
    });
    expect(addDays({ y: 2027, m: 3, d: 1 }, -1)).toEqual({
      y: 2027,
      m: 2,
      d: 28
    });
    expect(
      daysBetween({ y: 2027, m: 2, d: 10 }, { y: 2027, m: 2, d: 20 })
    ).toBe(10);
    expect(
      daysBetween({ y: 2027, m: 2, d: 20 }, { y: 2027, m: 2, d: 10 })
    ).toBe(-10);
  });
});

describe("month-end and year-end edge cases", () => {
  const dueOf = (config: CycleConfig, index: number) =>
    formatLocalDate(dueDateOf(config, index));
  const dueBeforeNextClosing = (config: CycleConfig, index: number) =>
    expect(
      periodBounds(config, index).dueInstant.getTime()
    ).toBeLessThanOrEqual(
      periodBounds(config, index + 1).closeInstant.getTime()
    );

  it("closing day 31 closes Jan 31, Feb 28 (2027) and Feb 29 (2028)", () => {
    const config = mx({ statementClosingDay: 31 });
    expect(formatLocalDate(closingDateOf(config, idx(2027, 1)))).toBe(
      "2027-01-31"
    );
    expect(formatLocalDate(closingDateOf(config, idx(2027, 2)))).toBe(
      "2027-02-28"
    );
    expect(formatLocalDate(closingDateOf(config, idx(2028, 1)))).toBe(
      "2028-01-31"
    );
    expect(formatLocalDate(closingDateOf(config, idx(2028, 2)))).toBe(
      "2028-02-29"
    );
  });

  it("days_after_closing 28 from Jan 31 2027 is Feb 28 and from Feb 28 2027 is Mar 28", () => {
    const config = mx({
      statementClosingDay: 31,
      paymentDueRule: "days_after_closing",
      paymentDueValue: 28
    });
    expect(dueOf(config, idx(2027, 1))).toBe("2027-02-28");
    expect(dueOf(config, idx(2027, 2))).toBe("2027-03-28");
    dueBeforeNextClosing(config, idx(2027, 1));
    dueBeforeNextClosing(config, idx(2027, 2));
  });

  it("day_of_next_month 31 with closing 31 clamps Jan's due date to Feb 28 and stays before the next closing", () => {
    const config = mx({ statementClosingDay: 31, paymentDueValue: 31 });
    expect(dueOf(config, idx(2027, 1))).toBe("2027-02-28");
    expect(dueOf(config, idx(2028, 1))).toBe("2028-02-29");
    dueBeforeNextClosing(config, idx(2027, 1));
    dueBeforeNextClosing(config, idx(2028, 1));
  });

  it("a December closing is due in January of the next year for both rules", () => {
    const fixed = mx({ statementClosingDay: 31, paymentDueValue: 15 });
    const after = mx({
      statementClosingDay: 31,
      paymentDueRule: "days_after_closing",
      paymentDueValue: 28
    });
    expect(dueOf(fixed, idx(2026, 12))).toBe("2027-01-15");
    expect(dueOf(after, idx(2026, 12))).toBe("2027-01-28");
    dueBeforeNextClosing(fixed, idx(2026, 12));
    dueBeforeNextClosing(after, idx(2026, 12));
  });
});
