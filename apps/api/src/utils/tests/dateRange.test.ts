import { describe, expect, it } from "vitest";
import { exclusiveDateRangeEnd } from "../dateRange.js";

describe("exclusiveDateRangeEnd", () => {
  it("turns a bare date into the start of the next UTC day", () => {
    expect(exclusiveDateRangeEnd("2026-11-05").toISOString()).toBe("2026-11-06T00:00:00.000Z");
  });

  it("rolls a bare date over a month end", () => {
    expect(exclusiveDateRangeEnd("2026-01-31").toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(exclusiveDateRangeEnd("2026-12-31").toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("keeps a UTC datetime unchanged", () => {
    expect(exclusiveDateRangeEnd("2026-11-06T06:00:00.000Z").toISOString()).toBe(
      "2026-11-06T06:00:00.000Z"
    );
  });

  it("normalizes an offset datetime to UTC without shifting a day", () => {
    expect(exclusiveDateRangeEnd("2026-11-05T14:30:00-06:00").toISOString()).toBe(
      "2026-11-05T20:30:00.000Z"
    );
  });
});
