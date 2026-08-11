import { describe, expect, it } from "vitest";
import { formatDateTime, formatStatus } from "../accountDisplay";

describe("formatDateTime", () => {
  it("formats a valid ISO timestamp", () => {
    expect(formatDateTime("2024-01-15T10:30:00.000Z")).toMatch(/2024/);
  });

  it("returns 'Never' for null/undefined", () => {
    expect(formatDateTime(null)).toBe("Never");
    expect(formatDateTime(undefined)).toBe("Never");
  });

  it("returns 'Never' for an empty string", () => {
    expect(formatDateTime("")).toBe("Never");
  });

  it("returns 'Unknown' for an unparseable value", () => {
    expect(formatDateTime("not-a-date")).toBe("Unknown");
  });
});

describe("formatStatus", () => {
  it("replaces the first underscore with a space", () => {
    expect(formatStatus("pending_review")).toBe("pending review");
  });

  it("returns 'unknown' for null/undefined/empty", () => {
    expect(formatStatus(null)).toBe("unknown");
    expect(formatStatus(undefined)).toBe("unknown");
    expect(formatStatus("")).toBe("unknown");
  });

  it("passes through a value with no underscore unchanged", () => {
    expect(formatStatus("active")).toBe("active");
  });
});
