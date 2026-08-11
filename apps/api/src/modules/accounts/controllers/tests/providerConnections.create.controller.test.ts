import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/providerConnections.create.service.js", () => ({
  confirmProviderAccounts: vi.fn(),
  createConnection: vi.fn()
}));

const { confirmProviderAccounts, createConnection } = await import(
  "../../services/providerConnections.create.service.js"
);
const { postConfirmAccounts, postConnection } = await import(
  "../providerConnections.create.controller.js"
);

describe("postConnection", () => {
  it("starts the connection flow and responds 201", async () => {
    vi.mocked(createConnection).mockResolvedValue({ provider: "syncfy" } as never);
    const res = mockResponse();

    await postConnection(mockRequest({ body: { provider: "syncfy" } }), res);

    expect(createConnection).toHaveBeenCalledWith("user-1", { provider: "syncfy" });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("throws a 401 when unauthenticated", async () => {
    await expect(
      postConnection(mockRequest({ user: undefined }), mockResponse())
    ).rejects.toThrow("Authentication required");
  });
});

describe("postConfirmAccounts", () => {
  it("confirms the selected provider accounts and responds 201", async () => {
    vi.mocked(confirmProviderAccounts).mockResolvedValue([{ id: "pa-1" }] as never);
    const res = mockResponse();

    await postConfirmAccounts(
      mockRequest({ body: { accounts: [{ providerAccountId: "pa-1" }] } }),
      res
    );

    expect(confirmProviderAccounts).toHaveBeenCalledWith("user-1", [
      { providerAccountId: "pa-1" }
    ]);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("throws a 401 when unauthenticated", async () => {
    await expect(
      postConfirmAccounts(mockRequest({ user: undefined }), mockResponse())
    ).rejects.toThrow("Authentication required");
  });
});
