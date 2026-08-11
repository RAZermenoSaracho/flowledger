import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../../../tests/helpers/prismaMock.js";

vi.mock("../../utils/googleState.js", () => ({
  signGoogleState: vi.fn(),
  verifyGoogleState: vi.fn()
}));

vi.mock("../../utils/googleStateCookie.js", () => ({
  googleStateCookieName: "flowledger_google_oauth_state",
  parseCookies: vi.fn()
}));

vi.mock("../google.client.js", () => ({
  exchangeGoogleCode: vi.fn(),
  verifyGoogleIdentity: vi.fn()
}));

vi.mock("../../../../services/create.service.js", () => ({
  issueRefreshToken: vi.fn()
}));

const { signGoogleState, verifyGoogleState } = await import("../../utils/googleState.js");
const { parseCookies } = await import("../../utils/googleStateCookie.js");
const { exchangeGoogleCode, verifyGoogleIdentity } = await import("../google.client.js");
const { issueRefreshToken } = await import("../../../../services/create.service.js");

const signGoogleStateMock = vi.mocked(signGoogleState);
const verifyGoogleStateMock = vi.mocked(verifyGoogleState);
const parseCookiesMock = vi.mocked(parseCookies);
const exchangeGoogleCodeMock = vi.mocked(exchangeGoogleCode);
const verifyGoogleIdentityMock = vi.mocked(verifyGoogleIdentity);
const issueRefreshTokenMock = vi.mocked(issueRefreshToken);

const { buildGoogleAuthUrl, handleGoogleCallback } = await import(
  "../create.service.js"
);

describe("buildGoogleAuthUrl", () => {
  it("builds the Google consent URL embedding a signed state token", () => {
    signGoogleStateMock.mockReturnValue("signed-state-jwt");

    const result = buildGoogleAuthUrl("/dashboard");

    expect(result.nonce).toHaveLength(43);
    expect(signGoogleStateMock).toHaveBeenCalledWith({
      nonce: result.nonce,
      redirect: "/dashboard"
    });
    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    expect(url.searchParams.get("state")).toBe("signed-state-jwt");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
  });
});

describe("handleGoogleCallback", () => {
  it("throws a 400 when the state cookie is missing", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/" });
    parseCookiesMock.mockReturnValue(new Map());

    await expect(
      handleGoogleCallback({ state: "state-token", cookieHeader: undefined, code: "c1" })
    ).rejects.toThrow("Invalid OAuth state");
  });

  it("throws a 400 when the cookie nonce doesn't match the state nonce", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/" });
    parseCookiesMock.mockReturnValue(
      new Map([["flowledger_google_oauth_state", "different-nonce"]])
    );

    await expect(
      handleGoogleCallback({ state: "state-token", cookieHeader: "x", code: "c1" })
    ).rejects.toThrow("Invalid OAuth state");
  });

  it("throws a 401 when Google reports an error (user cancelled)", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/" });
    parseCookiesMock.mockReturnValue(
      new Map([["flowledger_google_oauth_state", "nonce-1"]])
    );

    await expect(
      handleGoogleCallback({
        state: "state-token",
        cookieHeader: "x",
        error: "access_denied"
      })
    ).rejects.toThrow("Google authentication was cancelled");
  });

  it("throws a 401 when there's no code and no error", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/" });
    parseCookiesMock.mockReturnValue(
      new Map([["flowledger_google_oauth_state", "nonce-1"]])
    );

    await expect(
      handleGoogleCallback({ state: "state-token", cookieHeader: "x" })
    ).rejects.toThrow("Google authentication was cancelled");
  });

  it("reuses an existing linked account without creating a new user", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/dashboard" });
    parseCookiesMock.mockReturnValue(
      new Map([["flowledger_google_oauth_state", "nonce-1"]])
    );
    exchangeGoogleCodeMock.mockResolvedValue({
      access_token: "at-1",
      id_token: "idt-1"
    } as never);
    verifyGoogleIdentityMock.mockResolvedValue({
      providerAccountId: "google-sub-1",
      email: "ada@example.com",
      name: "Ada",
      picture: undefined
    });
    issueRefreshTokenMock.mockResolvedValue({
      token: "refresh-1",
      expiresAt: new Date()
    });

    const tx = {
      userAuthAccount: {
        findUnique: vi.fn().mockResolvedValue({
          user: { id: "user-1", email: "ada@example.com" }
        }),
        create: vi.fn()
      },
      user: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    const result = await handleGoogleCallback({
      state: "state-token",
      cookieHeader: "x",
      code: "auth-code"
    });

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(result.redirect).toBe("/dashboard");
    expect(result.refreshToken.token).toBe("refresh-1");
  });

  it("links an existing FlowLedger user found by email instead of creating a duplicate", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/" });
    parseCookiesMock.mockReturnValue(
      new Map([["flowledger_google_oauth_state", "nonce-1"]])
    );
    exchangeGoogleCodeMock.mockResolvedValue({} as never);
    verifyGoogleIdentityMock.mockResolvedValue({
      providerAccountId: "google-sub-1",
      email: "ada@example.com",
      name: "Ada",
      picture: "https://example.com/pic.jpg"
    });
    issueRefreshTokenMock.mockResolvedValue({
      token: "refresh-1",
      expiresAt: new Date()
    });

    const tx = {
      userAuthAccount: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: "user-1",
          email: "ada@example.com",
          avatarUrl: null
        }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: "user-1", avatarUrl: "https://example.com/pic.jpg" })
      }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await handleGoogleCallback({ state: "state-token", cookieHeader: "x", code: "auth-code" });

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.userAuthAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", provider: "google" })
      })
    );
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { avatarUrl: "https://example.com/pic.jpg" } })
    );
  });

  it("creates a brand-new user when no account or email match exists", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/" });
    parseCookiesMock.mockReturnValue(
      new Map([["flowledger_google_oauth_state", "nonce-1"]])
    );
    exchangeGoogleCodeMock.mockResolvedValue({} as never);
    verifyGoogleIdentityMock.mockResolvedValue({
      providerAccountId: "google-sub-2",
      email: "new@example.com",
      name: "New Person",
      picture: undefined
    });
    issueRefreshTokenMock.mockResolvedValue({
      token: "refresh-1",
      expiresAt: new Date()
    });

    const tx = {
      userAuthAccount: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "user-new",
          email: "new@example.com",
          avatarUrl: null
        }),
        update: vi.fn()
      }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await handleGoogleCallback({ state: "state-token", cookieHeader: "x", code: "auth-code" });

    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "new@example.com" })
      })
    );
  });
});
