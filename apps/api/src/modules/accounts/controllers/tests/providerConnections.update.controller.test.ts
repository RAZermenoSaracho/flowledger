import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/providerConnections.update.service.js", () => ({
  refreshSyncfyCredential: vi.fn(),
  resyncConnection: vi.fn(),
  resyncProviderAccount: vi.fn()
}));

const { refreshSyncfyCredential, resyncConnection, resyncProviderAccount } =
  await import("../../services/providerConnections.update.service.js");
const {
  postRefreshSyncfyCredential,
  postResyncConnection,
  postResyncProviderAccount
} = await import("../providerConnections.update.controller.js");

describe("postResyncConnection", () => {
  it("resyncs the connection", async () => {
    vi.mocked(resyncConnection).mockResolvedValue({ status: "processed" } as never);
    const res = mockResponse();

    await postResyncConnection(mockRequest({ params: { id: "conn-1" } }), res);

    expect(resyncConnection).toHaveBeenCalledWith("user-1", "conn-1");
  });

  it("throws a 401 when unauthenticated", async () => {
    await expect(
      postResyncConnection(mockRequest({ user: undefined }), mockResponse())
    ).rejects.toThrow("Authentication required");
  });
});

describe("postRefreshSyncfyCredential", () => {
  it("refreshes the credential", async () => {
    vi.mocked(refreshSyncfyCredential).mockResolvedValue({ status: "processed" } as never);
    const res = mockResponse();

    await postRefreshSyncfyCredential(
      mockRequest({ params: { providerCredentialId: "cred-1" } }),
      res
    );

    expect(refreshSyncfyCredential).toHaveBeenCalledWith("user-1", "cred-1");
  });

  it("throws a 400 when providerCredentialId is missing", async () => {
    await expect(
      postRefreshSyncfyCredential(mockRequest({ params: {} }), mockResponse())
    ).rejects.toThrow("Provider credential id is required");
  });
});

describe("postResyncProviderAccount", () => {
  it("resyncs the provider account", async () => {
    vi.mocked(resyncProviderAccount).mockResolvedValue({ status: "processed" } as never);
    const res = mockResponse();

    await postResyncProviderAccount(mockRequest({ params: { id: "pa-1" } }), res);

    expect(resyncProviderAccount).toHaveBeenCalledWith("user-1", "pa-1");
  });
});
