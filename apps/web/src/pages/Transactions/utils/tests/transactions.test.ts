import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTransactionAmount, todayDateString } from "../transactions";

describe("parseTransactionAmount", () => {
  it("returns a finite number unchanged", () => {
    expect(parseTransactionAmount(42.5)).toBe(42.5);
  });

  it("returns 0 for a non-finite number", () => {
    expect(parseTransactionAmount(Infinity)).toBe(0);
    expect(parseTransactionAmount(NaN)).toBe(0);
  });

  it("parses a numeric string, trimming whitespace", () => {
    expect(parseTransactionAmount(" 42.5 ")).toBe(42.5);
  });

  it("returns 0 for a non-numeric string", () => {
    expect(parseTransactionAmount("not a number")).toBe(0);
  });

  it("returns 0 for null/undefined/other types", () => {
    expect(parseTransactionAmount(null)).toBe(0);
    expect(parseTransactionAmount(undefined)).toBe(0);
    expect(parseTransactionAmount({})).toBe(0);
  });
});

describe("todayDateString", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("formats the local date as YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 2, 5)); // March 5, 2024, local time
    expect(todayDateString()).toBe("2024-03-05");
  });

  it("uses the local calendar day, not the UTC day, near a UTC day boundary", () => {
    // 11pm local time in a UTC-8 timezone is already 7am the next day in UTC —
    // this is the exact scenario that made the old `toISOString()`-based
    // implementation report tomorrow's date instead of today's.
    process.env.TZ = "America/Los_Angeles";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-05T23:00:00-08:00"));

    expect(new Date().toISOString().slice(0, 10)).toBe("2024-03-06"); // the old, buggy result
    expect(todayDateString()).toBe("2024-03-05"); // the correct local date
  });
});
