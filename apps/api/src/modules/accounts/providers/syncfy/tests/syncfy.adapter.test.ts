import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../config/env.js", () => ({
  env: {
    SYNCFY_WIDGET_SCRIPT_URL: "https://cdn.test/widget.js",
    SYNCFY_WIDGET_STYLE_URL: "https://cdn.test/widget.css"
  }
}));

vi.mock("../syncfy.client.js", () => ({
  createSyncfySession: vi.fn(),
  fetchSyncfyAccounts: vi.fn(),
  fetchSyncfyTransactions: vi.fn(),
  normalizeSyncfyAccount: vi.fn(),
  normalizeSyncfyTransaction: vi.fn()
}));

vi.mock("../services/read.service.js", () => ({
  getOrCreateSyncfyUserForFlowLedgerUser: vi.fn()
}));

vi.mock("../services/create.service.js", () => ({
  processSyncfyWebhookEvent: vi.fn()
}));

vi.mock("../services/update.service.js", () => ({
  markSyncfyWebhookEventFailed: vi.fn()
}));

const {
  createSyncfySession,
  fetchSyncfyAccounts,
  fetchSyncfyTransactions,
  normalizeSyncfyAccount,
  normalizeSyncfyTransaction
} = await import("../syncfy.client.js");
const { getOrCreateSyncfyUserForFlowLedgerUser } = await import(
  "../services/read.service.js"
);
const { processSyncfyWebhookEvent } = await import("../services/create.service.js");
const { markSyncfyWebhookEventFailed } = await import(
  "../services/update.service.js"
);
const { syncfyProvider } = await import("../syncfy.adapter.js");

const createSyncfySessionMock = vi.mocked(createSyncfySession);
const fetchSyncfyAccountsMock = vi.mocked(fetchSyncfyAccounts);
const fetchSyncfyTransactionsMock = vi.mocked(fetchSyncfyTransactions);
const normalizeSyncfyAccountMock = vi.mocked(normalizeSyncfyAccount);
const normalizeSyncfyTransactionMock = vi.mocked(normalizeSyncfyTransaction);
const getOrCreateSyncfyUserForFlowLedgerUserMock = vi.mocked(
  getOrCreateSyncfyUserForFlowLedgerUser
);
const processSyncfyWebhookEventMock = vi.mocked(processSyncfyWebhookEvent);
const markSyncfyWebhookEventFailedMock = vi.mocked(markSyncfyWebhookEventFailed);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncfyProvider.listConnectors", () => {
  it("returns the single Syncfy México connector", async () => {
    const connectors = await syncfyProvider.listConnectors!();
    expect(connectors).toHaveLength(1);
    expect(connectors[0]).toMatchObject({ provider: "syncfy", country: "MX" });
  });
});

describe("syncfyProvider.listInstitutions", () => {
  it("returns an empty list (Syncfy institutions come from the widget, not this endpoint)", async () => {
    await expect(syncfyProvider.listInstitutions!()).resolves.toEqual([]);
  });
});

describe("syncfyProvider.createUser", () => {
  it("delegates to getOrCreateSyncfyUserForFlowLedgerUser and maps the result", async () => {
    getOrCreateSyncfyUserForFlowLedgerUserMock.mockResolvedValue({
      idUser: "su-1",
      externalUserId: "user-1",
      rawData: { raw: true }
    } as never);

    const result = await syncfyProvider.createUser({
      externalUserId: "user-1"
    } as never);

    expect(getOrCreateSyncfyUserForFlowLedgerUserMock).toHaveBeenCalledWith(
      "user-1"
    );
    expect(result).toEqual({
      provider: "syncfy",
      providerUserId: "su-1",
      externalUserId: "user-1",
      rawData: { raw: true }
    });
  });
});

describe("syncfyProvider.createSession", () => {
  it("throws a 400 when neither providerUserId nor externalUserId is given", async () => {
    await expect(
      syncfyProvider.createSession({} as never)
    ).rejects.toThrow("Syncfy session requires a provider user id");
  });

  it("creates a session using providerUserId when present", async () => {
    createSyncfySessionMock.mockResolvedValue({ token: "tok-1" });

    const result = await syncfyProvider.createSession({
      providerUserId: "su-1",
      externalUserId: "user-1"
    } as never);

    expect(createSyncfySessionMock).toHaveBeenCalledWith("su-1");
    expect(result).toEqual({ provider: "syncfy", token: "tok-1" });
  });

  it("falls back to externalUserId when providerUserId is absent", async () => {
    createSyncfySessionMock.mockResolvedValue({ token: "tok-2" });

    await syncfyProvider.createSession({ externalUserId: "user-1" } as never);

    expect(createSyncfySessionMock).toHaveBeenCalledWith("user-1");
  });
});

describe("syncfyProvider.createConnectionFlow", () => {
  it("throws a 400 when there's no FlowLedger user id", async () => {
    await expect(
      syncfyProvider.createConnectionFlow({} as never)
    ).rejects.toThrow("Syncfy connection requires a FlowLedger user");
  });

  it("builds a widget config with the session token and configured URLs", async () => {
    getOrCreateSyncfyUserForFlowLedgerUserMock.mockResolvedValue({
      idUser: "su-1",
      externalUserId: "user-1"
    } as never);
    createSyncfySessionMock.mockResolvedValue({ token: "tok-1" });

    const result = await syncfyProvider.createConnectionFlow({
      providerUserId: "user-1"
    } as never);

    expect(result.token).toBe("tok-1");
    expect(result.widget).toMatchObject({
      token: "tok-1",
      scriptUrl: "https://cdn.test/widget.js",
      styleUrl: "https://cdn.test/widget.css"
    });
  });
});

describe("syncfyProvider.handleWebhook", () => {
  it("throws a 400 when eventId is missing", async () => {
    await expect(
      syncfyProvider.handleWebhook!({ payload: {} } as never)
    ).rejects.toThrow("Syncfy webhook processing requires event id");
  });

  it("returns the processing summary on success", async () => {
    processSyncfyWebhookEventMock.mockResolvedValue({
      status: "processed",
      importedAccounts: 2,
      importedTransactions: 5
    } as never);

    const result = await syncfyProvider.handleWebhook!({
      eventId: "evt-1",
      payload: {}
    } as never);

    expect(result).toEqual({
      status: "processed",
      importedAccounts: 2,
      importedTransactions: 5
    });
    expect(markSyncfyWebhookEventFailedMock).not.toHaveBeenCalled();
  });

  it("marks the event failed and rethrows when processing throws", async () => {
    const error = new Error("boom");
    processSyncfyWebhookEventMock.mockRejectedValue(error);

    await expect(
      syncfyProvider.handleWebhook!({ eventId: "evt-1", payload: {} } as never)
    ).rejects.toThrow("boom");

    expect(markSyncfyWebhookEventFailedMock).toHaveBeenCalledWith("evt-1", error);
  });
});

describe("syncfyProvider.fetchAccounts", () => {
  it("throws a 400 when endpoint or sessionToken is missing", async () => {
    await expect(
      syncfyProvider.fetchAccounts!({} as never)
    ).rejects.toThrow(
      "Syncfy account fetching requires endpoint and session token"
    );
  });

  it("maps fetched accounts to the generic provider shape", async () => {
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

    const result = await syncfyProvider.fetchAccounts!({
      endpoint: "/v1/accounts",
      sessionToken: "tok-1",
      providerCredentialId: "cred-1"
    } as never);

    expect(result).toEqual([
      {
        provider: "syncfy",
        providerAccountId: "acc-1",
        providerCredentialId: "cred-1",
        name: "Checking",
        type: "checking",
        currency: "MXN",
        balance: 100,
        rawData: {}
      }
    ]);
  });
});

describe("syncfyProvider.fetchTransactions", () => {
  it("throws a 400 when endpoint or sessionToken is missing", async () => {
    await expect(
      syncfyProvider.fetchTransactions!({} as never)
    ).rejects.toThrow(
      "Syncfy transaction fetching requires endpoint and session token"
    );
  });

  it("maps fetched transactions to the generic provider shape", async () => {
    fetchSyncfyTransactionsMock.mockResolvedValue([
      {
        syncfyTransactionId: "txn-1",
        syncfyCredentialId: "cred-1",
        syncfyAccountId: "acc-1",
        description: "Coffee",
        amount: -4.5,
        currency: "MXN",
        transactionDate: new Date("2024-01-01"),
        refreshDate: new Date("2024-01-01"),
        rawData: {}
      }
    ] as never);

    const result = await syncfyProvider.fetchTransactions!({
      endpoint: "/v1/transactions",
      sessionToken: "tok-1",
      providerCredentialId: "cred-1"
    } as never);

    expect(result[0]).toMatchObject({
      provider: "syncfy",
      providerTransactionId: "txn-1",
      description: "Coffee"
    });
  });
});

describe("syncfyProvider.normalizeAccount / normalizeTransaction", () => {
  it("normalizeAccount delegates to syncfy.client's normalizeSyncfyAccount", () => {
    normalizeSyncfyAccountMock.mockReturnValue({
      syncfyAccountId: "acc-1",
      syncfyCredentialId: "cred-1",
      name: "Checking",
      type: "checking",
      currency: "MXN",
      balance: 100,
      rawData: {}
    } as never);

    const result = syncfyProvider.normalizeAccount!({
      account: { id_account: "acc-1" },
      fallbackCredentialId: "cred-1"
    } as never);

    expect(normalizeSyncfyAccountMock).toHaveBeenCalledWith(
      { id_account: "acc-1" },
      "cred-1"
    );
    expect(result.providerAccountId).toBe("acc-1");
  });

  it("normalizeTransaction delegates to syncfy.client's normalizeSyncfyTransaction", () => {
    normalizeSyncfyTransactionMock.mockReturnValue({
      syncfyTransactionId: "txn-1",
      syncfyCredentialId: "cred-1",
      syncfyAccountId: "acc-1",
      description: "Coffee",
      amount: -4.5,
      currency: "MXN",
      transactionDate: new Date(),
      refreshDate: new Date(),
      rawData: {}
    } as never);

    const result = syncfyProvider.normalizeTransaction!({
      transaction: { id_transaction: "txn-1" },
      fallbackCredentialId: "cred-1"
    } as never);

    expect(result.providerTransactionId).toBe("txn-1");
  });
});
