import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../../../../config/env.js";
import { exchangeGoogleCode, verifyGoogleIdentity } from "../google.client.js";

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

describe("exchangeGoogleCode", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts the code to Google's token endpoint and returns the parsed token response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(true, {
        access_token: "at-1",
        expires_in: 3600,
        scope: "openid email",
        token_type: "Bearer",
        id_token: "idt-1"
      })
    );
    global.fetch = fetchMock as never;

    const result = await exchangeGoogleCode("auth-code-1");

    expect(result).toMatchObject({ access_token: "at-1", id_token: "idt-1" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect((init.body as URLSearchParams).get("code")).toBe("auth-code-1");
    expect((init.body as URLSearchParams).get("client_id")).toBe(
      env.GOOGLE_CLIENT_ID
    );
  });

  it("throws a 401 when Google rejects the code exchange", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(false, {})) as never;

    await expect(exchangeGoogleCode("bad-code")).rejects.toThrow(
      "Google authentication failed"
    );
  });

  it("throws a Zod error when the response is missing required fields", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(true, {})) as never;

    await expect(exchangeGoogleCode("auth-code-1")).rejects.toThrow();
  });
});

describe("verifyGoogleIdentity", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const validTokenInfo = {
    iss: "https://accounts.google.com",
    aud: env.GOOGLE_CLIENT_ID,
    sub: "google-sub-1",
    email: "Ada@Example.com",
    email_verified: "true",
    name: "Ada Lovelace",
    picture: "https://example.com/pic.jpg"
  };
  const validUserInfo = {
    sub: "google-sub-1",
    email: "ada@example.com",
    email_verified: true,
    name: "Ada Lovelace",
    picture: "https://example.com/pic.jpg"
  };

  function mockFetchSequence(...responses: Response[]) {
    const fetchMock = vi.fn();
    for (const response of responses) {
      fetchMock.mockImplementationOnce(async () => response);
    }
    global.fetch = fetchMock as never;
    return fetchMock;
  }

  it("returns a normalized profile for fully valid tokeninfo + userinfo", async () => {
    mockFetchSequence(
      jsonResponse(true, validTokenInfo),
      jsonResponse(true, validUserInfo)
    );

    const profile = await verifyGoogleIdentity("id-token-1", "access-token-1");

    expect(profile).toEqual({
      providerAccountId: "google-sub-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      picture: "https://example.com/pic.jpg"
    });
  });

  it("throws a 401 when the tokeninfo request fails", async () => {
    mockFetchSequence(jsonResponse(false, {}));

    await expect(
      verifyGoogleIdentity("id-token-1", "access-token-1")
    ).rejects.toThrow("Google identity verification failed");
  });

  it("throws a 401 when the audience doesn't match our client id", async () => {
    mockFetchSequence(
      jsonResponse(true, { ...validTokenInfo, aud: "someone-elses-client-id" })
    );

    await expect(
      verifyGoogleIdentity("id-token-1", "access-token-1")
    ).rejects.toThrow("Google identity verification failed");
  });

  it("throws a 401 when email_verified is false", async () => {
    mockFetchSequence(
      jsonResponse(true, { ...validTokenInfo, email_verified: "false" })
    );

    await expect(
      verifyGoogleIdentity("id-token-1", "access-token-1")
    ).rejects.toThrow("Google identity verification failed");
  });

  it("throws a 401 when the issuer isn't a recognized Google issuer", async () => {
    mockFetchSequence(
      jsonResponse(true, { ...validTokenInfo, iss: "https://evil.example.com" })
    );

    await expect(
      verifyGoogleIdentity("id-token-1", "access-token-1")
    ).rejects.toThrow("Google identity verification failed");
  });

  it("throws a 401 when the userinfo request fails", async () => {
    mockFetchSequence(jsonResponse(true, validTokenInfo), jsonResponse(false, {}));

    await expect(
      verifyGoogleIdentity("id-token-1", "access-token-1")
    ).rejects.toThrow("Google profile verification failed");
  });

  it("throws a 401 when userinfo.sub doesn't match tokeninfo.sub (cross-check)", async () => {
    mockFetchSequence(
      jsonResponse(true, validTokenInfo),
      jsonResponse(true, { ...validUserInfo, sub: "different-sub" })
    );

    await expect(
      verifyGoogleIdentity("id-token-1", "access-token-1")
    ).rejects.toThrow("Google profile verification failed");
  });

  it("throws a 401 when userinfo.email doesn't match tokeninfo.email (case-insensitive cross-check)", async () => {
    mockFetchSequence(
      jsonResponse(true, validTokenInfo),
      jsonResponse(true, { ...validUserInfo, email: "different@example.com" })
    );

    await expect(
      verifyGoogleIdentity("id-token-1", "access-token-1")
    ).rejects.toThrow("Google profile verification failed");
  });

  it("falls back to tokeninfo's name/picture when userinfo omits them", async () => {
    mockFetchSequence(
      jsonResponse(true, validTokenInfo),
      jsonResponse(true, { ...validUserInfo, name: undefined, picture: undefined })
    );

    const profile = await verifyGoogleIdentity("id-token-1", "access-token-1");

    expect(profile.name).toBe("Ada Lovelace");
    expect(profile.picture).toBe("https://example.com/pic.jpg");
  });
});
