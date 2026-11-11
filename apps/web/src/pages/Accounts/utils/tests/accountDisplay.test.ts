import { describe, expect, it } from "vitest";
import { ACCOUNT_TYPES } from "@flowledger/shared";
import {
  formatDateTime,
  formatStatus,
  getAccountTypeLabel
} from "../accountDisplay";

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

describe("getAccountTypeLabel", () => {
  it("labels every account type without the raw enum", () => {
    for (const type of ACCOUNT_TYPES) {
      const label = getAccountTypeLabel(type);
      expect(label).toBeTruthy();
      expect(label).not.toContain("_");
    }
  });

  it("labels checking as checking / debit", () => {
    expect(getAccountTypeLabel("checking")).toBe("Checking / debit");
  });
});
