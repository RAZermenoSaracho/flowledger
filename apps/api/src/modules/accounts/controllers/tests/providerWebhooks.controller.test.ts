import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/providerWebhooks.service.js", () => ({
  getProviderWebhookHealth: vi.fn(),
  handleProviderWebhook: vi.fn()
}));

const { getProviderWebhookHealth, handleProviderWebhook } = await import(
  "../../services/providerWebhooks.service.js"
);
const { getWebhookHealth, postWebhook } = await import(
  "../providerWebhooks.controller.js"
);

describe("postWebhook", () => {
  it("responds 400 when no provider param is given", async () => {
    const res = mockResponse();

    await postWebhook(mockRequest({ params: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(handleProviderWebhook).not.toHaveBeenCalled();
  });

  it("always replies 200 for a generic-provider result", async () => {
    vi.mocked(handleProviderWebhook).mockResolvedValue({
      kind: "generic",
      result: { status: "ok" }
    } as never);
    const res = mockResponse();

    await postWebhook(
      mockRequest({ params: { provider: "other" }, headers: {}, body: {} } as never),
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, acceptedEvents: 1 })
    );
  });

  it("still replies 200 (acceptedEvents: 0) for an invalid signature", async () => {
    vi.mocked(handleProviderWebhook).mockResolvedValue({
      kind: "invalid_signature"
    } as never);
    const res = mockResponse();

    await postWebhook(
      mockRequest({ params: { provider: "syncfy" }, headers: {}, body: {} } as never),
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, acceptedEvents: 0 });
  });

  it("replies 200 with the processed summary for a valid syncfy payload", async () => {
    vi.mocked(handleProviderWebhook).mockResolvedValue({
      kind: "processed",
      rid: "rid-1",
      signatureVerification: "valid",
      acceptedEvents: 2
    } as never);
    const res = mockResponse();

    await postWebhook(
      mockRequest({ params: { provider: "syncfy" }, headers: {}, body: {} } as never),
      res
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      rid: "rid-1",
      signatureVerification: "valid",
      acceptedEvents: 2
    });
  });
});

describe("getWebhookHealth", () => {
  it("responds 400 when no provider param is given", async () => {
    const res = mockResponse();

    await getWebhookHealth(mockRequest({ params: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns the provider's webhook health payload", async () => {
    vi.mocked(getProviderWebhookHealth).mockReturnValue({
      success: true,
      provider: "syncfy",
      message: "ok"
    } as never);
    const res = mockResponse();

    await getWebhookHealth(mockRequest({ params: { provider: "syncfy" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "syncfy" })
    );
  });
});
