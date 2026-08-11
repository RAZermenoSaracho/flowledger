import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../../../tests/helpers/prismaMock.js";

vi.mock("../../syncfy.client.js", () => ({
  createSyncfySession: vi.fn(),
  fetchSyncfyAccounts: vi.fn(),
  fetchSyncfyTransactions: vi.fn()
}));

const { createSyncfySession, fetchSyncfyAccounts, fetchSyncfyTransactions } =
  await import("../../syncfy.client.js");
const createSyncfySessionMock = vi.mocked(createSyncfySession);
const fetchSyncfyAccountsMock = vi.mocked(fetchSyncfyAccounts);
const fetchSyncfyTransactionsMock = vi.mocked(fetchSyncfyTransactions);

const { processSyncfyCredentialRefresh, processSyncfyWebhookEvent } =
  await import("../create.service.js");

function webhookEvent(overrides: Record<string, unknown> = {}) {
  return {
    header: {
      event: { name: "credentials.refreshed" },
      user: { id_user: "syncfy-user-1" }
    },
    payload: { id_credential: "cred-1", endpoints: {} },
    ...overrides
  } as never;
}

beforeEach(() => {
  createSyncfySessionMock.mockReset();
  fetchSyncfyAccountsMock.mockReset();
  fetchSyncfyTransactionsMock.mockReset();
});

describe("processSyncfyCredentialRefresh — no endpoints", () => {
  it("marks the webhook event processed and returns a zeroed summary", async () => {
    prismaMock.providerWebhookEvent.update.mockResolvedValue({} as never);

    const result = await processSyncfyCredentialRefresh({
      eventId: "evt-1",
      idUser: "syncfy-user-1",
      providerCredentialId: "cred-1",
      endpoints: {}
    });

    expect(result).toMatchObject({
      status: "processed",
      importedAccounts: 0,
      importedTransactions: 0
    });
    expect(prismaMock.providerWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      data: expect.objectContaining({ status: "processed" })
    });
    expect(createSyncfySessionMock).not.toHaveBeenCalled();
  });

  it("does not touch providerWebhookEvent when there's no eventId", async () => {
    await processSyncfyCredentialRefresh({
      idUser: "syncfy-user-1",
      providerCredentialId: "cred-1",
      endpoints: {}
    });

    expect(prismaMock.providerWebhookEvent.update).not.toHaveBeenCalled();
  });
});

describe("processSyncfyCredentialRefresh — with endpoints", () => {
  const endpoints = { accounts: ["/v1/accounts"], transactions: ["/v1/transactions"] };

  it("throws a 502 when no id_credential can be resolved from anywhere", async () => {
    createSyncfySessionMock.mockResolvedValue({ token: "tok-1" });
    fetchSyncfyAccountsMock.mockResolvedValue([]);
    fetchSyncfyTransactionsMock.mockResolvedValue([]);

    await expect(
      processSyncfyCredentialRefresh({
        idUser: "syncfy-user-1",
        endpoints
      })
    ).rejects.toThrow("Syncfy event is missing id_credential");
  });

  it("throws a 404 when no FlowLedger user can be resolved", async () => {
    createSyncfySessionMock.mockResolvedValue({ token: "tok-1" });
    fetchSyncfyAccountsMock.mockResolvedValue([]);
    fetchSyncfyTransactionsMock.mockResolvedValue([]);
    prismaMock.userAuthAccount.findUnique.mockResolvedValue(null);
    prismaMock.providerConnection.findUnique.mockResolvedValue(null);

    await expect(
      processSyncfyCredentialRefresh({
        idUser: "syncfy-user-1",
        providerCredentialId: "cred-1",
        endpoints
      })
    ).rejects.toThrow("FlowLedger user was not found for Syncfy event");
  });

  it("upserts the connection/accounts and inserts new imported transactions, skipping already-existing ones", async () => {
    createSyncfySessionMock.mockResolvedValue({ token: "tok-1" });
    fetchSyncfyAccountsMock.mockResolvedValue([
      {
        syncfyAccountId: "acc-1",
        syncfyCredentialId: "cred-1",
        name: "Checking",
        type: "checking",
        currency: "MXN",
        balance: 100,
        rawData: {}
      }
    ] as never);
    fetchSyncfyTransactionsMock.mockResolvedValue([
      {
        syncfyTransactionId: "txn-existing",
        syncfyCredentialId: "cred-1",
        syncfyAccountId: "acc-1",
        description: "Old",
        amount: -1,
        currency: "MXN",
        transactionDate: new Date(),
        refreshDate: new Date(),
        rawData: {}
      },
      {
        syncfyTransactionId: "txn-new",
        syncfyCredentialId: "cred-1",
        syncfyAccountId: "acc-1",
        description: "New",
        amount: -50,
        currency: "MXN",
        transactionDate: new Date(),
        refreshDate: new Date(),
        rawData: {}
      }
    ] as never);

    prismaMock.userAuthAccount.findUnique.mockResolvedValue({
      userId: "user-1"
    } as never);
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      { providerTransactionId: "txn-existing" }
    ] as never);
    prismaMock.providerConnection.upsert.mockResolvedValue({
      id: "conn-1"
    } as never);
    prismaMock.providerAccount.upsert.mockResolvedValue({
      id: "pa-1",
      providerCredentialId: "cred-1",
      providerAccountId: "acc-1"
    } as never);
    prismaMock.providerAccount.findMany.mockResolvedValue([]);
    prismaMock.providerImportedTransaction.create.mockResolvedValue({} as never);
    prismaMock.providerImportedTransaction.updateMany.mockResolvedValue({
      count: 0
    } as never);
    prismaMock.providerImportedTransaction.count.mockResolvedValue(1);
    prismaMock.notification.findFirst.mockResolvedValue(null);
    prismaMock.notification.create.mockResolvedValue({} as never);

    const result = await processSyncfyCredentialRefresh({
      eventId: "evt-1",
      idUser: "syncfy-user-1",
      providerCredentialId: "cred-1",
      endpoints
    });

    expect(result).toMatchObject({
      status: "processed",
      importedAccounts: 1,
      importedTransactions: 2,
      insertedOrUpdatedImportedTransactions: 1,
      skippedDuplicateTransactions: 1
    });

    expect(prismaMock.providerImportedTransaction.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.providerImportedTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ providerTransactionId: "txn-new" })
      })
    );
    expect(prismaMock.notification.create).toHaveBeenCalledOnce();
    expect(prismaMock.providerWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "evt-1" } })
    );
  });

  it("silently skips a P2002 unique-constraint conflict when inserting an imported transaction", async () => {
    createSyncfySessionMock.mockResolvedValue({ token: "tok-1" });
    fetchSyncfyAccountsMock.mockResolvedValue([]);
    fetchSyncfyTransactionsMock.mockResolvedValue([
      {
        syncfyTransactionId: "txn-race",
        syncfyCredentialId: "cred-1",
        syncfyAccountId: "acc-1",
        description: "Race condition",
        amount: -1,
        currency: "MXN",
        transactionDate: new Date(),
        refreshDate: new Date(),
        rawData: {}
      }
    ] as never);

    prismaMock.userAuthAccount.findUnique.mockResolvedValue({
      userId: "user-1"
    } as never);
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([]);
    prismaMock.providerConnection.upsert.mockResolvedValue({
      id: "conn-1"
    } as never);
    prismaMock.providerAccount.findMany.mockResolvedValue([]);
    prismaMock.providerImportedTransaction.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test"
      })
    );
    prismaMock.providerImportedTransaction.updateMany.mockResolvedValue({
      count: 0
    } as never);
    prismaMock.providerImportedTransaction.count.mockResolvedValue(0);
    prismaMock.notification.findFirst.mockResolvedValue(null);

    await expect(
      processSyncfyCredentialRefresh({
        idUser: "syncfy-user-1",
        providerCredentialId: "cred-1",
        endpoints
      })
    ).resolves.toMatchObject({ status: "processed" });
  });
});

describe("processSyncfyWebhookEvent", () => {
  it("returns 'ignored' without side effects when the event can't be claimed (already processed)", async () => {
    prismaMock.providerWebhookEvent.updateMany.mockResolvedValue({
      count: 0
    } as never);

    const result = await processSyncfyWebhookEvent("evt-1", webhookEvent());

    expect(result).toEqual({
      status: "ignored",
      importedAccounts: 0,
      importedTransactions: 0,
      insertedOrUpdatedImportedTransactions: 0,
      skippedDuplicateTransactions: 0
    });
    expect(prismaMock.providerWebhookEvent.update).not.toHaveBeenCalled();
  });

  it("marks an unsupported event type as ignored", async () => {
    prismaMock.providerWebhookEvent.updateMany.mockResolvedValue({
      count: 1
    } as never);
    prismaMock.providerWebhookEvent.update.mockResolvedValue({} as never);

    const result = await processSyncfyWebhookEvent(
      "evt-1",
      webhookEvent({ header: { event: { name: "other.event" }, user: { id_user: "u1" } } })
    );

    expect(result.status).toBe("ignored");
    expect(prismaMock.providerWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ignored" }) })
    );
  });

  it("throws a 400 when a credentials.refreshed event is missing id_user", async () => {
    prismaMock.providerWebhookEvent.updateMany.mockResolvedValue({
      count: 1
    } as never);

    await expect(
      processSyncfyWebhookEvent(
        "evt-1",
        webhookEvent({
          header: { event: { name: "credentials.refreshed" }, user: {} }
        })
      )
    ).rejects.toThrow("Syncfy event is missing id_user");
  });

  it("delegates a claimed credentials.refreshed event to processSyncfyCredentialRefresh", async () => {
    prismaMock.providerWebhookEvent.updateMany.mockResolvedValue({
      count: 1
    } as never);
    prismaMock.providerWebhookEvent.update.mockResolvedValue({} as never);

    const result = await processSyncfyWebhookEvent(
      "evt-1",
      webhookEvent({ payload: { id_credential: "cred-1", endpoints: {} } })
    );

    expect(result).toMatchObject({ status: "processed" });
    expect(prismaMock.providerWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "evt-1" } })
    );
  });
});
