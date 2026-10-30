import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../../utils/httpError.js";

vi.mock("../../../../middleware/credential.js", () => ({ verifyCredential: vi.fn() }));

const { verifyCredential } = await import("../../../../middleware/credential.js");
const { credentialTokenVerifier } = await import("../tokenVerifier.js");

describe("credentialTokenVerifier", () => {
  it("maps a verified credential to AuthInfo with a numeric expiry", async () => {
    vi.mocked(verifyCredential).mockResolvedValue({
      userId: "u1",
      email: "a@b.c",
      scopes: ["read", "write"],
      kind: "apiKey",
      credentialId: "k1"
    });
    const info = await credentialTokenVerifier.verifyAccessToken("fl_x");
    expect(info).toMatchObject({
      token: "fl_x",
      clientId: "k1",
      scopes: ["read", "write"],
      extra: { userId: "u1", kind: "apiKey" }
    });
    expect(info.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  it("maps a 401 HttpError to InvalidTokenError", async () => {
    vi.mocked(verifyCredential).mockRejectedValue(new HttpError(401, "nope"));
    await expect(credentialTokenVerifier.verifyAccessToken("x")).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it("propagates unexpected errors unchanged", async () => {
    const boom = new Error("db down");
    vi.mocked(verifyCredential).mockRejectedValue(boom);
    await expect(credentialTokenVerifier.verifyAccessToken("x")).rejects.toBe(boom);
  });
});
