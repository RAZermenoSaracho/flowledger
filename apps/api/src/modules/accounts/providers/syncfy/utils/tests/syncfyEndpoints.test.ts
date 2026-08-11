import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../config/env.js", () => ({
  env: {
    SYNCFY_DATA_BASE_URL: "https://data.syncfy.test",
    SYNCFY_TRANSACTION_LOOKBACK_DAYS: 60,
    SYNCFY_API_BASE_URL: "https://api.syncfy.test",
    SYNCFY_API_KEY: "test-api-key"
  }
}));

const {
  buildPendingSyncfyImportedTransactionCandidates,
  buildSyncfyProviderAccountMetadata,
  buildSyncfyRefreshMetadata,
  buildSyncfyTransactionDataUrl,
  countNewSyncfyImportedTransactionIds,
  getEndpointSummary,
  getSyncfyEndpointList,
  getSyncfyRefreshMetadata,
  nextSyncfyImportedTransactionStatus,
  providerAccountKey,
  resolveSyncfyImportedTransactionStatus,
  safeFailureReason,
  sanitizeSyncfyEndpointList,
  shouldMarkSyncfyManualReconnect,
  shouldStopSyncfyRefreshRetry,
  summarizeSyncfyEndpoints,
  summarizeSyncfyImportedTransactionWrites,
  syncfyBalanceFingerprint
} = await import("../syncfyEndpoints.js");

describe("getSyncfyEndpointList", () => {
  it("returns an array value unchanged (filtering non-strings)", () => {
    expect(
      getSyncfyEndpointList({ accounts: ["/v1/accounts", ""] }, "accounts")
    ).toEqual(["/v1/accounts"]);
  });

  it("wraps a single string value in an array", () => {
    expect(
      getSyncfyEndpointList({ transactions: "/v1/transactions" }, "transactions")
    ).toEqual(["/v1/transactions"]);
  });

  it("returns an empty array when the key is absent or endpoints isn't an object", () => {
    expect(getSyncfyEndpointList({}, "accounts")).toEqual([]);
    expect(getSyncfyEndpointList(null, "accounts")).toEqual([]);
  });
});

describe("summarizeSyncfyEndpoints", () => {
  it("counts accounts/transactions endpoints and lists present types", () => {
    expect(
      summarizeSyncfyEndpoints({
        accounts: ["/v1/accounts"],
        transactions: ["/v1/transactions", "/v1/transactions?p=2"]
      })
    ).toEqual({
      accountEndpointCount: 1,
      transactionEndpointCount: 2,
      endpointTypes: ["accounts", "transactions"]
    });
  });

  it("omits a type from endpointTypes when its count is 0", () => {
    expect(summarizeSyncfyEndpoints({ accounts: ["/v1/accounts"] })).toEqual({
      accountEndpointCount: 1,
      transactionEndpointCount: 0,
      endpointTypes: ["accounts"]
    });
  });
});

describe("sanitizeSyncfyEndpointList", () => {
  it("keeps only endpoints matching the expected path for the given key", () => {
    expect(
      sanitizeSyncfyEndpointList(
        { accounts: ["/v1/accounts?token=x", "/v1/transactions"] },
        "accounts"
      )
    ).toEqual(["/v1/accounts"]);
  });
});

describe("buildSyncfyRefreshMetadata", () => {
  it("sanitizes endpoints and includes a summary", () => {
    const metadata = buildSyncfyRefreshMetadata({
      providerCredentialId: "cred-1",
      providerUserId: "user-1",
      endpoints: { accounts: ["/v1/accounts?token=secret"] },
      now: new Date("2024-01-01T00:00:00.000Z")
    });

    expect(metadata).toMatchObject({
      provider: "syncfy",
      providerCredentialId: "cred-1",
      providerUserId: "user-1",
      endpoints: { accounts: ["/v1/accounts"], transactions: [] },
      storedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z"
    });
    expect(metadata.endpointSummary.accountEndpointCount).toBe(1);
  });
});

describe("getSyncfyRefreshMetadata", () => {
  it("reads stored metadata from rawData", () => {
    const result = getSyncfyRefreshMetadata({
      syncfyRefreshMetadata: { providerUserId: "user-1", endpoints: { accounts: [] } }
    });
    expect(result).toEqual({ providerUserId: "user-1", endpoints: { accounts: [] } });
  });

  it("returns undefined when no metadata is stored", () => {
    expect(getSyncfyRefreshMetadata({})).toBeUndefined();
    expect(getSyncfyRefreshMetadata(null)).toBeUndefined();
  });
});

describe("buildSyncfyTransactionDataUrl", () => {
  it("replaces paging/date-range params with a lookback window", () => {
    const now = new Date("2024-06-15T00:00:00.000Z");
    const url = buildSyncfyTransactionDataUrl({
      endpoint: "/v1/transactions?dt_refresh_from=1&limit=10",
      token: "tok",
      now
    });

    const toSeconds = Math.floor(now.getTime() / 1000);
    const fromSeconds = toSeconds - 60 * 24 * 60 * 60;

    expect(url.searchParams.get("dt_refresh_to")).toBe(String(toSeconds));
    expect(url.searchParams.get("dt_refresh_from")).toBe(String(fromSeconds));
    expect(url.searchParams.get("limit")).toBe("500");
    expect(url.searchParams.get("skip")).toBe("0");
  });

  it("respects explicit skip/limit overrides", () => {
    const url = buildSyncfyTransactionDataUrl({
      endpoint: "/v1/transactions",
      token: "tok",
      skip: 100,
      limit: 50
    });
    expect(url.searchParams.get("skip")).toBe("100");
    expect(url.searchParams.get("limit")).toBe("50");
  });

  it("throws a 400 for a non-transactions endpoint path", () => {
    expect(() =>
      buildSyncfyTransactionDataUrl({ endpoint: "/v1/accounts", token: "tok" })
    ).toThrow("Unexpected Syncfy transaction endpoint path");
  });
});

describe("getEndpointSummary", () => {
  it("reports hasEndpoints true when any endpoint type is present", () => {
    expect(getEndpointSummary({ accounts: ["/v1/accounts"] })).toEqual({
      hasEndpoints: true,
      endpointTypes: ["accounts"]
    });
  });

  it("reports hasEndpoints false when nothing is present", () => {
    expect(getEndpointSummary({})).toEqual({
      hasEndpoints: false,
      endpointTypes: []
    });
  });
});

describe("providerAccountKey", () => {
  it("joins credential and account id with a colon", () => {
    expect(providerAccountKey("cred-1", "acc-1")).toBe("cred-1:acc-1");
  });
});

describe("buildSyncfyProviderAccountMetadata", () => {
  it("picks only the display fields", () => {
    expect(
      buildSyncfyProviderAccountMetadata({
        name: "Checking",
        type: "checking",
        currency: "USD",
        balance: 100
      })
    ).toEqual({ name: "Checking", type: "checking", currency: "USD", balance: 100 });
  });
});

describe("syncfyBalanceFingerprint", () => {
  it("is order-independent (sorted internally)", () => {
    const a = [
      { syncfyAccountId: "1", syncfyCredentialId: "c", balance: 10, currency: "USD" },
      { syncfyAccountId: "2", syncfyCredentialId: "c", balance: 20, currency: "USD" }
    ];
    const b = [a[1], a[0]];

    expect(syncfyBalanceFingerprint(a as never)).toBe(
      syncfyBalanceFingerprint(b as never)
    );
  });

  it("differs when a balance changes", () => {
    const a = [{ syncfyAccountId: "1", balance: 10 }];
    const b = [{ syncfyAccountId: "1", balance: 20 }];
    expect(syncfyBalanceFingerprint(a as never)).not.toBe(
      syncfyBalanceFingerprint(b as never)
    );
  });
});

describe("shouldStopSyncfyRefreshRetry", () => {
  const base = {
    attemptIndex: 0,
    totalAttempts: 3,
    fetchedTransactionsCount: 5,
    balanceFingerprint: "fp-1",
    insertedOrUpdatedImportedTransactions: 0
  };

  it("stops as soon as new transactions were written", () => {
    expect(
      shouldStopSyncfyRefreshRetry({ ...base, insertedOrUpdatedImportedTransactions: 1 })
    ).toBe(true);
  });

  it("stops once attempts are exhausted", () => {
    expect(shouldStopSyncfyRefreshRetry({ ...base, attemptIndex: 2 })).toBe(true);
  });

  it("stops when the transaction count changed since the previous attempt", () => {
    expect(
      shouldStopSyncfyRefreshRetry({
        ...base,
        previousFetchedTransactionsCount: 3
      })
    ).toBe(true);
  });

  it("stops when the balance fingerprint changed since the previous attempt", () => {
    expect(
      shouldStopSyncfyRefreshRetry({ ...base, previousBalanceFingerprint: "fp-0" })
    ).toBe(true);
  });

  it("continues retrying when nothing changed and attempts remain", () => {
    expect(
      shouldStopSyncfyRefreshRetry({
        ...base,
        previousFetchedTransactionsCount: 5,
        previousBalanceFingerprint: "fp-1"
      })
    ).toBe(false);
  });
});

describe("shouldMarkSyncfyManualReconnect", () => {
  it.each([
    "OTP required",
    "MFA challenge",
    "token expired",
    "invalid credential",
    "401 unauthorized",
    "403 forbidden",
    "interactive login required",
    "session expired"
  ])("returns true for %j", (message) => {
    expect(shouldMarkSyncfyManualReconnect(new Error(message))).toBe(true);
  });

  it("returns false for a transient/timeout error", () => {
    expect(shouldMarkSyncfyManualReconnect(new Error("upstream timeout"))).toBe(
      false
    );
  });

  it("handles a non-Error thrown value", () => {
    expect(shouldMarkSyncfyManualReconnect("unauthorized")).toBe(true);
  });
});

describe("resolveSyncfyImportedTransactionStatus / nextSyncfyImportedTransactionStatus", () => {
  it("defaults to 'pending' when there's no existing status", () => {
    expect(resolveSyncfyImportedTransactionStatus({})).toBe("pending");
  });

  it("advances 'imported' to 'processed' once linked to a transaction", () => {
    expect(
      nextSyncfyImportedTransactionStatus({ status: "imported", transactionId: "t1" })
    ).toBe("processed");
  });

  it("keeps 'imported' as 'pending' when not yet linked", () => {
    expect(nextSyncfyImportedTransactionStatus({ status: "imported" })).toBe(
      "pending"
    );
  });

  it("leaves any other status untouched", () => {
    expect(nextSyncfyImportedTransactionStatus({ status: "ignored" })).toBe(
      "ignored"
    );
  });
});

describe("summarizeSyncfyImportedTransactionWrites", () => {
  it("splits inserted-or-updated vs. skipped-duplicate counts", () => {
    const result = summarizeSyncfyImportedTransactionWrites({
      existingTransactionIds: new Set(["t1"]),
      transactions: [
        { syncfyTransactionId: "t1" },
        { syncfyTransactionId: "t2" }
      ] as never
    });

    expect(result).toEqual({
      insertedOrUpdatedImportedTransactions: 1,
      skippedDuplicateTransactions: 1
    });
  });
});

describe("buildPendingSyncfyImportedTransactionCandidates", () => {
  it("filters out existing transactions and maps the rest to insert candidates", () => {
    const result = buildPendingSyncfyImportedTransactionCandidates({
      existingTransactionIds: new Set(["t1"]),
      transactions: [
        {
          syncfyTransactionId: "t1",
          syncfyCredentialId: "c1",
          syncfyAccountId: "a1",
          description: "old",
          amount: -1,
          currency: "USD",
          transactionDate: new Date(),
          refreshDate: new Date(),
          rawData: {}
        },
        {
          syncfyTransactionId: "t2",
          syncfyCredentialId: "c1",
          syncfyAccountId: "a1",
          description: "new",
          amount: -50,
          currency: "USD",
          transactionDate: new Date(),
          refreshDate: new Date(),
          rawData: {}
        }
      ] as never
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      providerTransactionId: "t2",
      description: "new",
      status: "pending"
    });
  });
});

describe("countNewSyncfyImportedTransactionIds", () => {
  it("counts only transactions not already present", () => {
    expect(
      countNewSyncfyImportedTransactionIds({
        existingTransactionIds: new Set(["t1"]),
        transactions: [
          { syncfyTransactionId: "t1" },
          { syncfyTransactionId: "t2" },
          { syncfyTransactionId: "t3" }
        ] as never
      })
    ).toBe(2);
  });
});

describe("safeFailureReason", () => {
  it("extracts an Error's message", () => {
    expect(safeFailureReason(new Error("boom"))).toBe("boom");
  });

  it("stringifies a non-Error value", () => {
    expect(safeFailureReason("plain string")).toBe("plain string");
  });

  it("truncates to 1000 characters", () => {
    expect(safeFailureReason(new Error("x".repeat(2000)))).toHaveLength(1000);
  });
});
