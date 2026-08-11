import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/providerConnections.read.service.js", () => ({
  getConnectionStatus: vi.fn(),
  listConnectors: vi.fn(),
  listInstitutions: vi.fn(),
  listProviderAccounts: vi.fn()
}));

const {
  getConnectionStatus,
  listConnectors,
  listInstitutions,
  listProviderAccounts
} = await import("../../services/providerConnections.read.service.js");
const {
  getConnectionStatusHandler,
  getConnectors,
  getInstitutions,
  getProviderAccounts
} = await import("../providerConnections.read.controller.js");

describe("getConnectors", () => {
  it("lists available connectors", async () => {
    vi.mocked(listConnectors).mockResolvedValue([{ provider: "syncfy" }] as never);
    const res = mockResponse();

    await getConnectors(mockRequest(), res);

    expect(res.json).toHaveBeenCalledWith({ connectors: [{ provider: "syncfy" }] });
  });
});

describe("getInstitutions", () => {
  it("passes query filters through to the service", async () => {
    vi.mocked(listInstitutions).mockResolvedValue([] as never);
    const res = mockResponse();

    await getInstitutions(mockRequest({ query: { q: "bbva" } }), res);

    expect(listInstitutions).toHaveBeenCalledWith({ q: "bbva" });
  });
});

describe("getConnectionStatusHandler", () => {
  it("returns the connection status", async () => {
    vi.mocked(getConnectionStatus).mockResolvedValue({ id: "conn-1" } as never);
    const res = mockResponse();

    await getConnectionStatusHandler(mockRequest({ params: { id: "conn-1" } }), res);

    expect(getConnectionStatus).toHaveBeenCalledWith("user-1", "conn-1");
  });

  it("throws a 401 when unauthenticated", async () => {
    await expect(
      getConnectionStatusHandler(mockRequest({ user: undefined }), mockResponse())
    ).rejects.toThrow("Authentication required");
  });
});

describe("getProviderAccounts", () => {
  it("passes the status filter through", async () => {
    vi.mocked(listProviderAccounts).mockResolvedValue([] as never);
    const res = mockResponse();

    await getProviderAccounts(mockRequest({ query: { status: "unlinked" } }), res);

    expect(listProviderAccounts).toHaveBeenCalledWith("user-1", {
      status: "unlinked"
    });
  });
});
