import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../../../tests/helpers/prismaMock.js";

vi.mock("../create.service.js", () => ({
  processSyncfyCredentialRefresh: vi.fn()
}));

const { processSyncfyCredentialRefresh } = await import("../create.service.js");
const processSyncfyCredentialRefreshMock = vi.mocked(
  processSyncfyCredentialRefresh
);

const {
  getManualSyncfyRefreshRetryDelaysMs,
  markSyncfyWebhookEventFailed,
  resyncSyncfyConnection,
  resyncSyncfyCredential
} = await import("../update.service.js");

function storedConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    providerCredentialId: "cred-1",
    providerUserId: "syncfy-user-1",
    rawData: {
      syncfyRefreshMetadata: {
        providerUserId: "syncfy-user-1",
        endpoints: { accounts: ["/v1/accounts"], transactions: ["/v1/transactions"] }
      }
    },
    ...overrides
  };
}

const processedResult = {
  status: "processed" as const,
  importedAccounts: 1,
  importedTransactions: 2,
  insertedOrUpdatedImportedTransactions: 1,
  skippedDuplicateTransactions: 1,
  refreshAttemptCount: 1,
  balanceFingerprint: "fp"
};

beforeEach(() => {
  processSyncfyCredentialRefreshMock.mockReset();
});

describe("resyncSyncfyConnection", () => {
  it("throws a 404 when the connection isn't found for this user", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue(null);

    await expect(
      resyncSyncfyConnection({ userId: "user-1", connectionId: "conn-1" })
    ).rejects.toThrow("Syncfy connection was not found");
  });

  it("marks the connection/accounts reconnect_required when there's no stored refresh metadata", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue(
      storedConnection({ rawData: {} }) as never
    );
    prismaMock.providerConnection.updateMany.mockResolvedValue({
      count: 1
    } as never);
    prismaMock.providerAccount.updateMany.mockResolvedValue({
      count: 1
    } as never);

    const result = await resyncSyncfyConnection({
      userId: "user-1",
      connectionId: "conn-1"
    });

    expect(result.status).toBe("manual_reconnect_required");
    expect(result.requiresManualReconnect).toBe(true);
    expect(prismaMock.providerConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requiresManualReconnect: true })
      })
    );
    expect(processSyncfyCredentialRefreshMock).not.toHaveBeenCalled();
  });

  it("processes a single refresh (no retryDelaysMs) and returns the processed summary", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue(
      storedConnection() as never
    );
    processSyncfyCredentialRefreshMock.mockResolvedValue(processedResult);

    const result = await resyncSyncfyConnection({
      userId: "user-1",
      connectionId: "conn-1"
    });

    expect(processSyncfyCredentialRefreshMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "processed",
      importedAccounts: 1,
      requiresManualReconnect: false
    });
  });

  it("retries per retryDelaysMs, stopping once new transactions are inserted", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue(
      storedConnection() as never
    );
    processSyncfyCredentialRefreshMock
      .mockResolvedValueOnce({ ...processedResult, insertedOrUpdatedImportedTransactions: 0 })
      .mockResolvedValueOnce({ ...processedResult, insertedOrUpdatedImportedTransactions: 3 });

    const result = await resyncSyncfyConnection({
      userId: "user-1",
      connectionId: "conn-1",
      retryDelaysMs: [0, 0, 0]
    });

    expect(processSyncfyCredentialRefreshMock).toHaveBeenCalledTimes(2);
    expect(result.refreshAttemptCount).toBe(2);
  });

  it("marks manual reconnect required and does not rethrow when the failure looks like an auth issue", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue(
      storedConnection() as never
    );
    prismaMock.providerConnection.updateMany.mockResolvedValue({
      count: 1
    } as never);
    prismaMock.providerAccount.updateMany.mockResolvedValue({
      count: 1
    } as never);
    processSyncfyCredentialRefreshMock.mockRejectedValue(
      new Error("401 unauthorized")
    );

    const result = await resyncSyncfyConnection({
      userId: "user-1",
      connectionId: "conn-1"
    });

    expect(result.status).toBe("manual_reconnect_required");
    expect(result.requiresManualReconnect).toBe(true);
  });

  it("marks the connection sync_failed and rethrows for a non-auth failure", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue(
      storedConnection() as never
    );
    prismaMock.providerConnection.update.mockResolvedValue({} as never);
    processSyncfyCredentialRefreshMock.mockRejectedValue(
      new Error("upstream timeout")
    );

    await expect(
      resyncSyncfyConnection({ userId: "user-1", connectionId: "conn-1" })
    ).rejects.toThrow("upstream timeout");

    expect(prismaMock.providerConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "sync_failed" })
      })
    );
  });
});

describe("resyncSyncfyCredential", () => {
  it("throws a 404 when no connection matches the credential", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue(null);

    await expect(
      resyncSyncfyCredential({ userId: "user-1", providerCredentialId: "cred-1" })
    ).rejects.toThrow("Syncfy credential connection was not found");
  });

  it("resolves the connection id and delegates to resyncSyncfyConnection", async () => {
    prismaMock.providerConnection.findFirst
      .mockResolvedValueOnce({ id: "conn-1" } as never)
      .mockResolvedValueOnce(storedConnection() as never);
    processSyncfyCredentialRefreshMock.mockResolvedValue(processedResult);

    const result = await resyncSyncfyCredential({
      userId: "user-1",
      providerCredentialId: "cred-1"
    });

    expect(result.status).toBe("processed");
  });
});

describe("getManualSyncfyRefreshRetryDelaysMs", () => {
  it("returns the fixed retry schedule as a fresh array each call", () => {
    const first = getManualSyncfyRefreshRetryDelaysMs();
    const second = getManualSyncfyRefreshRetryDelaysMs();

    expect(first).toEqual([0, 5000, 15000, 30000]);
    expect(first).not.toBe(second);
  });
});

describe("markSyncfyWebhookEventFailed", () => {
  it("marks the event failed with the error message truncated to 1000 characters", async () => {
    prismaMock.providerWebhookEvent.update.mockResolvedValue({} as never);

    await markSyncfyWebhookEventFailed("evt-1", new Error("x".repeat(2000)));

    expect(prismaMock.providerWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      data: expect.objectContaining({
        status: "failed",
        errorMessage: "x".repeat(1000)
      })
    });
  });

  it("handles a non-Error thrown value", async () => {
    prismaMock.providerWebhookEvent.update.mockResolvedValue({} as never);

    await markSyncfyWebhookEventFailed("evt-1", "plain string error");

    expect(prismaMock.providerWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorMessage: "Unknown error" })
      })
    );
  });
});
