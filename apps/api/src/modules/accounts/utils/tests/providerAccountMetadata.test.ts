import { AccountType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  getNumber,
  getRecord,
  getString,
  normalizeAccountType,
  providerAccountSummary
} from "../providerAccountMetadata.js";

describe("getRecord", () => {
  it("returns the object unchanged for a plain object", () => {
    expect(getRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it("returns {} for an array", () => {
    expect(getRecord([1, 2])).toEqual({});
  });

  it("returns {} for null/undefined/primitives", () => {
    expect(getRecord(null)).toEqual({});
    expect(getRecord(undefined)).toEqual({});
    expect(getRecord("string")).toEqual({});
  });
});

describe("getString", () => {
  it("trims and returns a non-empty string", () => {
    expect(getString("  hello  ")).toBe("hello");
  });

  it("returns undefined for an empty/whitespace-only string", () => {
    expect(getString("   ")).toBeUndefined();
  });

  it("returns undefined for a non-string", () => {
    expect(getString(42)).toBeUndefined();
  });
});

describe("getNumber", () => {
  it("returns a finite number unchanged", () => {
    expect(getNumber(42.5)).toBe(42.5);
  });

  it("parses a numeric string", () => {
    expect(getNumber("42.5")).toBe(42.5);
  });

  it("returns undefined for NaN/Infinity", () => {
    expect(getNumber(NaN)).toBeUndefined();
    expect(getNumber(Infinity)).toBeUndefined();
  });

  it("returns undefined for a non-numeric string", () => {
    expect(getNumber("abc")).toBeUndefined();
  });
});

describe("normalizeAccountType", () => {
  it.each([
    ["credit card", AccountType.credit_card],
    ["tarjeta de credito", AccountType.credit_card],
    ["savings", AccountType.savings],
    ["ahorro", AccountType.savings],
    ["checking", AccountType.checking],
    ["cuenta corriente", AccountType.checking],
    ["brokerage", AccountType.investment],
    ["inversion", AccountType.investment],
    ["cash", AccountType.cash],
    ["efectivo", AccountType.cash],
    ["something else entirely", AccountType.other],
    [undefined, AccountType.other]
  ])("maps %j to %s", (input, expected) => {
    expect(normalizeAccountType(input)).toBe(expected);
  });
});

describe("providerAccountSummary", () => {
  it("builds a display summary from raw accountMetadata", () => {
    const summary = providerAccountSummary({
      id: "pa-1",
      provider: "syncfy",
      accountMetadata: { name: "My Checking", type: "checking", currency: "usd", balance: "100" },
      status: "active",
      failureReason: null,
      requiresManualReconnect: false,
      lastSyncAt: null,
      lastSyncSuccessAt: null,
      lastSyncFailureAt: null,
      accountId: null,
      account: null,
      connection: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-02")
    } as never);

    expect(summary).toMatchObject({
      name: "My Checking",
      type: AccountType.checking,
      providerType: "checking",
      currency: "usd",
      balance: 100,
      linkedAccount: null
    });
  });

  it("defaults name to 'Imported account' and balance/currency to null when metadata is empty", () => {
    const summary = providerAccountSummary({
      id: "pa-1",
      provider: "syncfy",
      accountMetadata: {},
      status: "active",
      failureReason: null,
      requiresManualReconnect: false,
      lastSyncAt: null,
      lastSyncSuccessAt: null,
      lastSyncFailureAt: null,
      accountId: null,
      account: null,
      connection: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-02")
    } as never);

    expect(summary.name).toBe("Imported account");
    expect(summary.currency).toBeNull();
    expect(summary.balance).toBeNull();
  });

  it("includes a trimmed linkedAccount summary when the provider account is linked", () => {
    const summary = providerAccountSummary({
      id: "pa-1",
      provider: "syncfy",
      accountMetadata: {},
      status: "active",
      failureReason: null,
      requiresManualReconnect: false,
      lastSyncAt: null,
      lastSyncSuccessAt: null,
      lastSyncFailureAt: null,
      accountId: "acc-1",
      account: { id: "acc-1", name: "Checking", type: "checking" },
      connection: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-02")
    } as never);

    expect(summary.linkedAccount).toEqual({
      id: "acc-1",
      name: "Checking",
      type: "checking"
    });
  });
});
