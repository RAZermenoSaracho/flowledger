import { describe, expect, it } from "vitest";
import {
  accountListItemWithSyncSummary,
  providerAccountSyncSummary
} from "../accountSyncSummary.js";

function providerAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "pa-1",
    provider: "syncfy",
    providerCredentialId: "cred-1",
    providerAccountId: "ext-1",
    accountMetadata: { name: "Checking", type: "checking", currency: "USD", balance: "123.45" },
    status: "active",
    failureReason: null,
    requiresManualReconnect: false,
    lastSyncAt: null,
    lastSyncSuccessAt: null,
    lastSyncFailureAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
    connection: null,
    ...overrides
  };
}

describe("providerAccountSyncSummary", () => {
  it("reads display fields out of accountMetadata", () => {
    const summary = providerAccountSyncSummary(providerAccount() as never);

    expect(summary).toMatchObject({
      accountName: "Checking",
      accountType: "checking",
      currency: "USD",
      externalBalance: 123.45
    });
  });

  it("falls back to the parent connection's status/failure/timestamps when the provider account has none of its own", () => {
    const summary = providerAccountSyncSummary(
      providerAccount({
        failureReason: null,
        requiresManualReconnect: false,
        lastSyncAt: null,
        connection: {
          institutionId: "inst-1",
          institutionName: "Test Bank",
          status: "error",
          failureReason: "auth_expired",
          requiresManualReconnect: true,
          lastSyncAt: new Date("2024-02-01"),
          lastSyncSuccessAt: null,
          lastSyncFailureAt: new Date("2024-02-01")
        }
      }) as never
    );

    expect(summary).toMatchObject({
      institutionId: "inst-1",
      institutionName: "Test Bank",
      failureReason: "auth_expired",
      requiresManualReconnect: true,
      connectionStatus: "error",
      lastSyncAt: new Date("2024-02-01")
    });
  });

  it("prefers the provider account's own failureReason/requiresManualReconnect over the connection's", () => {
    const summary = providerAccountSyncSummary(
      providerAccount({
        failureReason: "own_error",
        requiresManualReconnect: true,
        connection: { failureReason: "conn_error", requiresManualReconnect: false }
      }) as never
    );

    expect(summary.failureReason).toBe("own_error");
    expect(summary.requiresManualReconnect).toBe(true);
  });

  it("returns null display fields when accountMetadata is empty", () => {
    const summary = providerAccountSyncSummary(
      providerAccount({ accountMetadata: {} }) as never
    );

    expect(summary).toMatchObject({
      accountName: null,
      accountType: null,
      currency: null,
      externalBalance: null
    });
  });
});

describe("accountListItemWithSyncSummary", () => {
  it("derives source 'synced' and attaches sync summaries when providerAccounts exist", () => {
    const account = {
      id: "acc-1",
      name: "Checking",
      providerAccounts: [providerAccount()]
    };

    const result = accountListItemWithSyncSummary(account as never);

    expect(result.source).toBe("synced");
    expect(result.sync).toHaveLength(1);
    expect(result).not.toHaveProperty("providerAccounts");
  });

  it("derives source 'manual' and an empty sync array when there are no providerAccounts", () => {
    const account = { id: "acc-1", name: "Cash", providerAccounts: [] };
    const result = accountListItemWithSyncSummary(account as never);

    expect(result.source).toBe("manual");
    expect(result.sync).toEqual([]);
  });
});
