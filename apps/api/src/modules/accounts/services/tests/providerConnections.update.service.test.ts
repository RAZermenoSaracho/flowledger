import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../providers/syncfy/services/update.service.js", () => ({
  getManualSyncfyRefreshRetryDelaysMs: vi.fn(),
  resyncSyncfyConnection: vi.fn(),
  resyncSyncfyCredential: vi.fn()
}));

const {
  getManualSyncfyRefreshRetryDelaysMs,
  resyncSyncfyConnection,
  resyncSyncfyCredential
} = await import("../../providers/syncfy/services/update.service.js");
const getManualSyncfyRefreshRetryDelaysMsMock = vi.mocked(
  getManualSyncfyRefreshRetryDelaysMs
);
const resyncSyncfyConnectionMock = vi.mocked(resyncSyncfyConnection);
const resyncSyncfyCredentialMock = vi.mocked(resyncSyncfyCredential);

const { refreshSyncfyCredential, resyncConnection, resyncProviderAccount } =
  await import("../providerConnections.update.service.js");

describe("resyncConnection", () => {
  it("throws a 404 when the connection isn't owned by the user", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue(null);

    await expect(resyncConnection("user-1", "conn-1")).rejects.toThrow(
      "Provider connection was not found"
    );
  });

  it("throws a 501 for a non-syncfy provider", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue({
      id: "conn-1",
      provider: "other"
    } as never);

    await expect(resyncConnection("user-1", "conn-1")).rejects.toThrow(
      "Provider resync is not configured"
    );
  });

  it("delegates to resyncSyncfyConnection with the retry-delay schedule", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue({
      id: "conn-1",
      provider: "syncfy"
    } as never);
    getManualSyncfyRefreshRetryDelaysMsMock.mockReturnValue([0, 5000]);
    resyncSyncfyConnectionMock.mockResolvedValue({ status: "processed" } as never);

    const result = await resyncConnection("user-1", "conn-1");

    expect(resyncSyncfyConnectionMock).toHaveBeenCalledWith({
      userId: "user-1",
      connectionId: "conn-1",
      retryDelaysMs: [0, 5000]
    });
    expect(result).toEqual({ status: "processed" });
  });
});

describe("refreshSyncfyCredential", () => {
  it("delegates to resyncSyncfyCredential with the retry-delay schedule", async () => {
    getManualSyncfyRefreshRetryDelaysMsMock.mockReturnValue([0]);
    resyncSyncfyCredentialMock.mockResolvedValue({ status: "processed" } as never);

    await refreshSyncfyCredential("user-1", "cred-1");

    expect(resyncSyncfyCredentialMock).toHaveBeenCalledWith({
      userId: "user-1",
      providerCredentialId: "cred-1",
      retryDelaysMs: [0]
    });
  });
});

describe("resyncProviderAccount", () => {
  it("throws a 404 when no linked provider account is found", async () => {
    prismaMock.providerAccount.findFirst.mockResolvedValue(null);

    await expect(resyncProviderAccount("user-1", "pa-1")).rejects.toThrow(
      "Synced account was not found"
    );
  });

  it("throws a 409 when the provider account has no connection", async () => {
    prismaMock.providerAccount.findFirst.mockResolvedValue({
      id: "pa-1",
      provider: "syncfy",
      connection: null
    } as never);

    await expect(resyncProviderAccount("user-1", "pa-1")).rejects.toThrow(
      "Synced account is missing a connection"
    );
  });

  it("throws a 501 for a non-syncfy provider", async () => {
    prismaMock.providerAccount.findFirst.mockResolvedValue({
      id: "pa-1",
      provider: "other",
      connection: { id: "conn-1" }
    } as never);

    await expect(resyncProviderAccount("user-1", "pa-1")).rejects.toThrow(
      "Provider resync is not configured"
    );
  });

  it("delegates to resyncSyncfyConnection using the account's connection id", async () => {
    prismaMock.providerAccount.findFirst.mockResolvedValue({
      id: "pa-1",
      provider: "syncfy",
      connection: { id: "conn-1" }
    } as never);
    getManualSyncfyRefreshRetryDelaysMsMock.mockReturnValue([0]);
    resyncSyncfyConnectionMock.mockResolvedValue({ status: "processed" } as never);

    await resyncProviderAccount("user-1", "pa-1");

    expect(resyncSyncfyConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "conn-1" })
    );
  });
});
