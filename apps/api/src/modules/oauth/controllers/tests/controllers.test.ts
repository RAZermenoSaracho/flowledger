import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/create.service.js", () => ({
  decideConsent: vi.fn().mockResolvedValue({ redirectUrl: "https://app.example/cb?code=c" })
}));
vi.mock("../../services/read.service.js", () => ({
  getConsentContext: vi.fn().mockResolvedValue({ user: { email: "user1@example.com" } }),
  listOAuthGrants: vi
    .fn()
    .mockResolvedValue([{ id: "g1", createdAt: new Date("2026-01-01T00:00:00Z"), expiresAt: null }])
}));
vi.mock("../../services/delete.service.js", () => ({ revokeOAuthGrant: vi.fn() }));

const { decideConsent } = await import("../../services/create.service.js");
const { getConsentContext, listOAuthGrants } = await import("../../services/read.service.js");
const { revokeOAuthGrant } = await import("../../services/delete.service.js");
const { postDecision } = await import("../create.controller.js");
const { getContext, getOAuthGrants } = await import("../read.controller.js");
const { deleteOAuthGrant } = await import("../delete.controller.js");

describe("oauth controllers", () => {
  it("postDecision binds the decision to the session user, not the body", async () => {
    vi.mocked(decideConsent).mockResolvedValue({ redirectUrl: "https://app.example/cb?code=c" });
    const res = mockResponse();
    const body = { req: "r", approve: true, allowWrite: false, lifetime: "1m" };

    await postDecision(mockRequest({ body: { ...body, userId: "attacker" } }), res);

    expect(decideConsent).toHaveBeenCalledWith("user-1", expect.objectContaining(body));
    expect(res.json).toHaveBeenCalledWith({ redirectUrl: "https://app.example/cb?code=c" });
  });

  it("getContext passes the session email and the req query", async () => {
    vi.mocked(getConsentContext).mockResolvedValue({ user: { email: "user1@example.com" } } as never);
    const res = mockResponse();

    await getContext(mockRequest({ query: { req: "tok" } }), res);

    expect(getConsentContext).toHaveBeenCalledWith("user1@example.com", "tok");
  });

  it("getOAuthGrants serializes dates", async () => {
    vi.mocked(listOAuthGrants).mockResolvedValue([
      { id: "g1", createdAt: new Date("2026-01-01T00:00:00Z"), expiresAt: null }
    ] as never);
    const res = mockResponse();

    await getOAuthGrants(mockRequest(), res);

    expect(res.json).toHaveBeenCalledWith({
      grants: [{ id: "g1", createdAt: "2026-01-01T00:00:00.000Z", expiresAt: null }]
    });
  });

  it("deleteOAuthGrant revokes and answers 204", async () => {
    const res = mockResponse();

    await deleteOAuthGrant(mockRequest({ params: { id: "g1" } } as never), res);

    expect(revokeOAuthGrant).toHaveBeenCalledWith("user-1", "g1");
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
