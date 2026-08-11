import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../utils/institutionCatalog.js", () => ({
  filterInstitutions: vi.fn(),
  listAvailableConnectors: vi.fn(),
  listAvailableInstitutions: vi.fn()
}));

const { filterInstitutions, listAvailableConnectors, listAvailableInstitutions } =
  await import("../../utils/institutionCatalog.js");
const filterInstitutionsMock = vi.mocked(filterInstitutions);
const listAvailableConnectorsMock = vi.mocked(listAvailableConnectors);
const listAvailableInstitutionsMock = vi.mocked(listAvailableInstitutions);

const {
  getConnectionStatus,
  listConnectors,
  listInstitutions,
  listProviderAccounts
} = await import("../providerConnections.read.service.js");

describe("listConnectors", () => {
  it("strips the internal metadata field off each connector", async () => {
    listAvailableConnectorsMock.mockResolvedValue([
      { provider: "syncfy", connectorId: "c1", title: "Syncfy", metadata: { secret: true } }
    ] as never);

    const result = await listConnectors();

    expect(result).toEqual([{ provider: "syncfy", connectorId: "c1", title: "Syncfy" }]);
  });
});

describe("listInstitutions", () => {
  it("delegates to filterInstitutions with the given filters", async () => {
    listAvailableInstitutionsMock.mockResolvedValue([{ id: "a" }] as never);
    filterInstitutionsMock.mockReturnValue([{ id: "a" }] as never);

    const result = await listInstitutions({ q: "bbva" });

    expect(filterInstitutionsMock).toHaveBeenCalledWith([{ id: "a" }], { q: "bbva" });
    expect(result).toEqual([{ id: "a" }]);
  });
});

describe("getConnectionStatus", () => {
  it("throws a 404 when the connection isn't owned by the user", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue(null);

    await expect(getConnectionStatus("user-1", "conn-1")).rejects.toThrow(
      "Provider connection was not found"
    );
  });

  it("shapes the status payload with counts and the latest webhook event", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue({
      id: "conn-1",
      provider: "syncfy",
      providerCredentialId: "cred-1",
      institutionId: "bbva",
      institutionName: "BBVA",
      status: "active",
      failureReason: null,
      requiresManualReconnect: false,
      lastSyncAt: null,
      lastSyncSuccessAt: null,
      lastSyncFailureAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { accounts: 2, importedTransactions: 5 }
    } as never);
    prismaMock.providerWebhookEvent.findFirst.mockResolvedValue({
      id: "evt-1",
      eventName: "credentials.refreshed",
      status: "processed"
    } as never);

    const result = await getConnectionStatus("user-1", "conn-1");

    expect(result).toMatchObject({
      id: "conn-1",
      accountsCount: 2,
      importedTransactionsCount: 5,
      latestWebhookEvent: { id: "evt-1" }
    });
  });
});

describe("listProviderAccounts", () => {
  it("scopes results to the user by default", async () => {
    prismaMock.providerAccount.findMany.mockResolvedValue([]);
    prismaMock.providerAccount.count.mockResolvedValue(0);

    await listProviderAccounts("user-1", {});

    const call = prismaMock.providerAccount.findMany.mock.calls[0]?.[0] as {
      where: unknown;
    };
    expect(JSON.stringify(call.where)).toContain("user-1");
    expect(JSON.stringify(call.where)).not.toContain("accountId");
  });

  it("adds an unlinked (accountId is null) filter when status is 'unlinked'", async () => {
    prismaMock.providerAccount.findMany.mockResolvedValue([]);
    prismaMock.providerAccount.count.mockResolvedValue(0);

    await listProviderAccounts("user-1", { status: "unlinked" });

    const call = prismaMock.providerAccount.findMany.mock.calls[0]?.[0] as {
      where: unknown;
    };
    expect(JSON.stringify(call.where)).toContain("accountId");
  });

  it("maps results through providerAccountSummary", async () => {
    prismaMock.providerAccount.findMany.mockResolvedValue([
      {
        id: "pa-1",
        provider: "syncfy",
        accountMetadata: { name: "Checking" },
        status: "active",
        failureReason: null,
        requiresManualReconnect: false,
        lastSyncAt: null,
        lastSyncSuccessAt: null,
        lastSyncFailureAt: null,
        accountId: null,
        account: null,
        connection: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ] as never);
    prismaMock.providerAccount.count.mockResolvedValue(1);

    const [account] = await listProviderAccounts("user-1", {});
    expect(account?.name).toBe("Checking");
  });
});
