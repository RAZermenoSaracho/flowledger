import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatTransactionDate,
  localDayStartInstant,
  transactionDateInputValue,
  transactionDateNowInputValue,
  transactionDateRequestValue
} from "../dateTime";

const ZONES = ["America/Mexico_City", "Pacific/Kiritimati", "America/Los_Angeles"] as const;
const originalTz = process.env.TZ;

function useZone(zone: string) {
  process.env.TZ = zone;
}

function dateTimeIn(zone: string, iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function dateIn(zone: string, iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { timeZone: zone });
}

afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = originalTz;
});

describe.each(ZONES)("formatTransactionDate in %s", (zone) => {
  it("shows date and time for a timed transaction", () => {
    useZone(zone);
    const date = "2026-11-06T03:00:00.000Z";
    expect(formatTransactionDate({ date })).toBe(dateTimeIn(zone, date));
  });

  it("shows no time when the linked provider date equals date at UTC noon", () => {
    useZone(zone);
    const date = "2026-06-04T12:00:00.000Z";
    const shown = formatTransactionDate({ date, providerImportedTransaction: { transactionDate: date } });
    expect(shown).toBe(dateIn(zone, date));
    expect(shown).not.toBe(dateTimeIn(zone, date));
  });

  it("shows the time for a manual transaction at UTC noon", () => {
    useZone(zone);
    const date = "2026-06-04T12:00:00.000Z";
    expect(formatTransactionDate({ date, providerImportedTransaction: null })).toBe(dateTimeIn(zone, date));
    expect(formatTransactionDate({ date })).toBe(dateTimeIn(zone, date));
  });

  it("shows the time once an imported transaction's date was edited away from the provider value", () => {
    useZone(zone);
    const date = "2026-06-04T20:15:00.000Z";
    expect(
      formatTransactionDate({
        date,
        providerImportedTransaction: { transactionDate: "2026-06-04T12:00:00.000Z" }
      })
    ).toBe(dateTimeIn(zone, date));
  });

  it("shows the time for an imported transaction whose provider value is not UTC noon", () => {
    useZone(zone);
    const date = "2026-06-04T09:30:00.000Z";
    expect(formatTransactionDate({ date, providerImportedTransaction: { transactionDate: date } })).toBe(
      dateTimeIn(zone, date)
    );
  });
});

describe("formatTransactionDate across zones", () => {
  it("shows the previous local evening at UTC-6 and the next local afternoon at UTC+14", () => {
    const date = "2026-11-06T03:00:00.000Z";
    useZone("America/Mexico_City");
    const west = formatTransactionDate({ date });
    useZone("Pacific/Kiritimati");
    const east = formatTransactionDate({ date });
    expect(west).not.toBe(east);
    expect(west).toBe(dateTimeIn("America/Mexico_City", date));
    expect(east).toBe(dateTimeIn("Pacific/Kiritimati", date));
  });
});

describe.each(ZONES)("transactionDateInputValue in %s", (zone) => {
  it("is the local date and minute of the instant", () => {
    useZone(zone);
    const expected = {
      "America/Mexico_City": "2026-05-31T15:33",
      "Pacific/Kiritimati": "2026-06-01T11:33",
      "America/Los_Angeles": "2026-05-31T14:33"
    }[zone];
    expect(transactionDateInputValue({ date: "2026-05-31T21:33:15.979Z" })).toBe(expected);
  });
});

describe("transactionDateNowInputValue", () => {
  it("is the current local time, which differs from UTC at UTC-6", () => {
    useZone("America/Mexico_City");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T03:00:00.000Z"));
    expect(transactionDateNowInputValue()).toBe("2026-11-05T21:00");
  });
});

describe("transactionDateRequestValue with an original", () => {
  const original = { date: "2026-05-31T21:33:15.979Z" };

  it("returns undefined when the value matches the prefill", () => {
    useZone("America/Mexico_City");
    expect(transactionDateRequestValue("2026-05-31T15:33", original)).toBeUndefined();
  });

  it("returns undefined when the value is changed and then restored", () => {
    useZone("America/Mexico_City");
    expect(transactionDateRequestValue("2026-06-02T15:33", original)).toBeDefined();
    expect(transactionDateRequestValue(transactionDateInputValue(original), original)).toBeUndefined();
  });

  it("keeps the local time and sub-minute precision when only the date changes", () => {
    useZone("America/Mexico_City");
    expect(transactionDateRequestValue("2026-06-02T15:33", original)).toBe("2026-06-02T21:33:15.979Z");
  });

  it("keeps the local date and sub-minute precision when only the time changes", () => {
    useZone("America/Mexico_City");
    expect(transactionDateRequestValue("2026-05-31T16:45", original)).toBe("2026-05-31T22:45:15.979Z");
  });

  it("keeps the local time of day when the date moves across a DST change", () => {
    useZone("America/Los_Angeles");
    const stored = { date: "2026-03-07T17:00:00.000Z" };
    expect(transactionDateInputValue(stored)).toBe("2026-03-07T09:00");
    expect(transactionDateRequestValue("2026-03-09T09:00", stored)).toBe("2026-03-09T16:00:00.000Z");
  });
});

describe("transactionDateRequestValue without an original", () => {
  it("converts the local entry to a UTC instant", () => {
    useZone("America/Mexico_City");
    expect(transactionDateRequestValue("2026-11-05T14:30")).toBe("2026-11-05T20:30:00.000Z");
  });

  it("converts at a positive offset", () => {
    useZone("Pacific/Kiritimati");
    expect(transactionDateRequestValue("2026-11-05T14:30")).toBe("2026-11-05T00:30:00.000Z");
  });
});

describe("localDayStartInstant", () => {
  it("starts a Kiritimati day (UTC+14) on the previous UTC day", () => {
    useZone("Pacific/Kiritimati");
    expect(localDayStartInstant("2026-11-05")).toBe("2026-11-04T10:00:00.000Z");
    expect(localDayStartInstant("2026-11-05", 1)).toBe("2026-11-05T10:00:00.000Z");
  });

  it("handles the 23-hour spring-forward day in Los Angeles", () => {
    useZone("America/Los_Angeles");
    expect(localDayStartInstant("2026-03-08")).toBe("2026-03-08T08:00:00.000Z");
    expect(localDayStartInstant("2026-03-08", 1)).toBe("2026-03-09T07:00:00.000Z");
  });

  it("handles the 25-hour fall-back day in Los Angeles", () => {
    useZone("America/Los_Angeles");
    expect(localDayStartInstant("2026-11-01")).toBe("2026-11-01T07:00:00.000Z");
    expect(localDayStartInstant("2026-11-01", 1)).toBe("2026-11-02T08:00:00.000Z");
  });

  it("rolls over month and year ends", () => {
    useZone("America/Mexico_City");
    expect(localDayStartInstant("2026-01-31", 1)).toBe("2026-02-01T06:00:00.000Z");
    expect(localDayStartInstant("2026-12-31", 1)).toBe("2027-01-01T06:00:00.000Z");
  });
});
