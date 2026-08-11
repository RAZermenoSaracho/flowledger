import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../../../tests/helpers/prismaMock.js";

vi.mock("../../syncfy.client.js", () => ({
  createSyncfyUser: vi.fn(),
  fetchSyncfyUserByExternalId: vi.fn()
}));

const { createSyncfyUser, fetchSyncfyUserByExternalId } = await import(
  "../../syncfy.client.js"
);
const createSyncfyUserMock = vi.mocked(createSyncfyUser);
const fetchSyncfyUserByExternalIdMock = vi.mocked(fetchSyncfyUserByExternalId);

const {
  getOrCreateSyncfyUserForFlowLedgerUser,
  loadActiveSyncfyAutoSyncJobs
} = await import("../read.service.js");

beforeEach(() => {
  createSyncfyUserMock.mockReset();
  fetchSyncfyUserByExternalIdMock.mockReset();
});

describe("loadActiveSyncfyAutoSyncJobs", () => {
  it("maps connection rows to {connectionId, userId} jobs", async () => {
    prismaMock.providerConnection.findMany.mockResolvedValue([
      { id: "conn-1", userId: "user-1" },
      { id: "conn-2", userId: "user-2" }
    ] as never);

    const jobs = await loadActiveSyncfyAutoSyncJobs();

    expect(jobs).toEqual([
      { connectionId: "conn-1", userId: "user-1" },
      { connectionId: "conn-2", userId: "user-2" }
    ]);
    expect(prismaMock.providerConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: "syncfy",
          requiresManualReconnect: false
        })
      })
    );
  });
});

describe("getOrCreateSyncfyUserForFlowLedgerUser", () => {
  it("throws a 404 when the FlowLedger user doesn't exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      getOrCreateSyncfyUserForFlowLedgerUser("missing-user")
    ).rejects.toThrow("FlowLedger user was not found");
  });

  it("reuses a stored provider-account mapping without calling Syncfy", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user1@example.com",
      name: "Ada"
    } as never);
    prismaMock.userAuthAccount.findFirst.mockResolvedValue({
      providerAccountId: "su-1"
    } as never);

    const result = await getOrCreateSyncfyUserForFlowLedgerUser("user-1");

    expect(result).toMatchObject({ idUser: "su-1", externalUserId: "user-1" });
    expect(fetchSyncfyUserByExternalIdMock).not.toHaveBeenCalled();
    expect(createSyncfyUserMock).not.toHaveBeenCalled();
  });

  it("reuses an existing Syncfy user found by external id, and stores the mapping", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user1@example.com",
      name: "Ada"
    } as never);
    prismaMock.userAuthAccount.findFirst.mockResolvedValue(null);
    fetchSyncfyUserByExternalIdMock.mockResolvedValue({
      idUser: "su-2",
      externalUserId: "user-1",
      rawData: {}
    });

    const result = await getOrCreateSyncfyUserForFlowLedgerUser("user-1");

    expect(result.idUser).toBe("su-2");
    expect(createSyncfyUserMock).not.toHaveBeenCalled();
    expect(prismaMock.userAuthAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ providerAccountId: "su-2" })
      })
    );
  });

  it("creates a new Syncfy user as a last resort, and stores the mapping", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user1@example.com",
      name: "Ada"
    } as never);
    prismaMock.userAuthAccount.findFirst.mockResolvedValue(null);
    fetchSyncfyUserByExternalIdMock.mockResolvedValue(undefined);
    createSyncfyUserMock.mockResolvedValue({
      idUser: "su-3",
      externalUserId: "user-1",
      rawData: {}
    });

    const result = await getOrCreateSyncfyUserForFlowLedgerUser("user-1");

    expect(result.idUser).toBe("su-3");
    expect(createSyncfyUserMock).toHaveBeenCalledWith({
      externalUserId: "user-1",
      name: "Ada"
    });
  });
});
