import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../utils/providerRegistry.js", () => ({
  getProvider: vi.fn()
}));

vi.mock("../../utils/institutionCatalog.js", () => ({
  findSelectedConnector: vi.fn(),
  findSelectedInstitution: vi.fn(),
  listAvailableConnectors: vi.fn().mockResolvedValue([]),
  listAvailableInstitutions: vi.fn().mockResolvedValue([])
}));

const { getProvider } = await import("../../utils/providerRegistry.js");
const {
  findSelectedConnector,
  findSelectedInstitution,
  listAvailableConnectors,
  listAvailableInstitutions
} = await import("../../utils/institutionCatalog.js");

const getProviderMock = vi.mocked(getProvider);
const findSelectedConnectorMock = vi.mocked(findSelectedConnector);
const findSelectedInstitutionMock = vi.mocked(findSelectedInstitution);

const { confirmProviderAccounts, createConnection } = await import(
  "../providerConnections.create.service.js"
);

describe("createConnection", () => {
  it("throws a 404 when the requested institution isn't available", async () => {
    findSelectedInstitutionMock.mockReturnValue(undefined);

    await expect(
      createConnection("user-1", { institutionId: "missing-inst" })
    ).rejects.toThrow("Institution is not available");
  });

  it("throws a 404 when neither institution nor connector match", async () => {
    findSelectedConnectorMock.mockReturnValue(undefined);

    await expect(
      createConnection("user-1", { provider: "unknown-provider" })
    ).rejects.toThrow("Connector is not available");
  });

  it("throws a 501 when the provider has no connection flow or session support", async () => {
    findSelectedConnectorMock.mockReturnValue({
      provider: "syncfy",
      connectorId: "c1",
      title: "Syncfy"
    } as never);
    getProviderMock.mockReturnValue({} as never);

    await expect(
      createConnection("user-1", { provider: "syncfy" })
    ).rejects.toThrow("Institution connection is not configured");
  });

  it("uses createConnectionFlow for an institution-based connection", async () => {
    findSelectedInstitutionMock.mockReturnValue({
      provider: "syncfy",
      institutionId: "bbva",
      name: "BBVA"
    } as never);
    getProviderMock.mockReturnValue({
      createConnectionFlow: vi.fn().mockResolvedValue({
        provider: "syncfy",
        token: "tok-1",
        widget: { config: {} }
      })
    } as never);

    const result = await createConnection("user-1", { institutionId: "bbva" });

    expect(result).toMatchObject({
      provider: "syncfy",
      institutionId: "bbva",
      institutionName: "BBVA",
      token: "tok-1"
    });
  });

  it("falls back to createSession for a bare connector connection", async () => {
    findSelectedConnectorMock.mockReturnValue({
      provider: "syncfy",
      connectorId: "c1",
      title: "Syncfy México"
    } as never);
    getProviderMock.mockReturnValue({
      createSession: vi.fn().mockResolvedValue({ provider: "syncfy", token: "tok-2" })
    } as never);

    const result = await createConnection("user-1", { provider: "syncfy" });

    expect(result).toMatchObject({
      provider: "syncfy",
      connectorId: "c1",
      institutionName: "Syncfy México",
      token: "tok-2"
    });
  });
});

describe("confirmProviderAccounts", () => {
  it("throws a 404 when the provider account isn't owned by the user", async () => {
    prismaMock.providerAccount.findFirst.mockResolvedValue(null);

    await expect(
      confirmProviderAccounts("user-1", [{ providerAccountId: "pa-1" }])
    ).rejects.toThrow("Imported provider account was not found");
  });

  it("returns the summary unchanged when already linked", async () => {
    prismaMock.providerAccount.findFirst.mockResolvedValue({
      id: "pa-1",
      accountId: "acc-1",
      accountMetadata: {},
      account: { id: "acc-1" },
      connection: null
    } as never);

    const result = await confirmProviderAccounts("user-1", [
      { providerAccountId: "pa-1" }
    ]);

    expect(result).toHaveLength(1);
    expect(prismaMock.providerAccount.update).not.toHaveBeenCalled();
  });

  it("links to an explicit accountId after verifying ownership", async () => {
    prismaMock.providerAccount.findFirst.mockResolvedValue({
      id: "pa-1",
      accountId: null,
      accountMetadata: {},
      account: null,
      connection: null
    } as never);
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-2" } as never);
    prismaMock.providerAccount.update.mockResolvedValue({
      id: "pa-1",
      accountId: "acc-2",
      accountMetadata: {},
      account: { id: "acc-2" },
      connection: null
    } as never);

    await confirmProviderAccounts("user-1", [
      { providerAccountId: "pa-1", accountId: "acc-2" }
    ]);

    expect(prismaMock.providerAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { accountId: "acc-2" } })
    );
  });

  it("throws a 404 when the explicit accountId isn't owned by the user", async () => {
    prismaMock.providerAccount.findFirst.mockResolvedValue({
      id: "pa-1",
      accountId: null,
      accountMetadata: {},
      account: null,
      connection: null
    } as never);
    prismaMock.account.findFirst.mockResolvedValue(null);

    await expect(
      confirmProviderAccounts("user-1", [
        { providerAccountId: "pa-1", accountId: "not-mine" }
      ])
    ).rejects.toThrow("FlowLedger account was not found");
  });

  it("creates a new account from provider metadata when no accountId is given", async () => {
    prismaMock.providerAccount.findFirst.mockResolvedValue({
      id: "pa-1",
      accountId: null,
      accountMetadata: { name: "Checking", type: "checking", currency: "usd", balance: "50" },
      account: null,
      connection: null
    } as never);
    prismaMock.account.create.mockResolvedValue({ id: "acc-new" } as never);
    prismaMock.providerAccount.update.mockResolvedValue({
      id: "pa-1",
      accountId: "acc-new",
      accountMetadata: {},
      account: { id: "acc-new" },
      connection: null
    } as never);

    await confirmProviderAccounts("user-1", [{ providerAccountId: "pa-1" }]);

    expect(prismaMock.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", currency: "USD" })
      })
    );
  });
});
