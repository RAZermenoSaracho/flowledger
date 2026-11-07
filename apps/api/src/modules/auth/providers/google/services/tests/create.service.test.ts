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

const { buildGoogleAuthUrl, handleGoogleCallback, hasGoogleLink } = await import(
  "../create.service.js"
);

describe("buildGoogleAuthUrl", () => {
  it("builds the Google consent URL embedding a signed state token", () => {
    signGoogleStateMock.mockReturnValue("signed-state-jwt");

    const result = buildGoogleAuthUrl("/dashboard", false);

    expect(result.nonce).toHaveLength(43);
    expect(signGoogleStateMock).toHaveBeenCalledWith({
      nonce: result.nonce,
      redirect: "/dashboard",
      keepLoggedIn: false
    });
    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    expect(url.searchParams.get("state")).toBe("signed-state-jwt");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
  });
});

describe("buildGoogleAuthUrl with a link user", () => {
  it("signs the link user into the state", () => {
    signGoogleStateMock.mockReturnValue("signed-state-jwt");

    const result = buildGoogleAuthUrl("/profile", true, "user-1");

    expect(signGoogleStateMock).toHaveBeenCalledWith({
      nonce: result.nonce,
      redirect: "/profile",
      keepLoggedIn: true,
      linkUserId: "user-1"
    });
  });
});

describe("handleGoogleCallback", () => {
  it("throws a 400 when the state cookie is missing", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/", keepLoggedIn: true });
    parseCookiesMock.mockReturnValue(new Map());

    await expect(
      handleGoogleCallback({ state: "state-token", cookieHeader: undefined, code: "c1" })
    ).rejects.toThrow("Invalid OAuth state");
  });

  it("throws a 400 when the cookie nonce doesn't match the state nonce", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/", keepLoggedIn: true });
    parseCookiesMock.mockReturnValue(
      new Map([["flowledger_google_oauth_state", "different-nonce"]])
    );

    await expect(
      handleGoogleCallback({ state: "state-token", cookieHeader: "x", code: "c1" })
    ).rejects.toThrow("Invalid OAuth state");
  });

  it("throws a 401 when Google reports an error (user cancelled)", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/", keepLoggedIn: true });
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
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/", keepLoggedIn: true });
    parseCookiesMock.mockReturnValue(
      new Map([["flowledger_google_oauth_state", "nonce-1"]])
    );

    await expect(
      handleGoogleCallback({ state: "state-token", cookieHeader: "x" })
    ).rejects.toThrow("Google authentication was cancelled");
  });

  it("reuses an existing linked account without creating a new user", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/dashboard", keepLoggedIn: true });
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
      expiresAt: new Date(),
      persistent: true
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
    expect(result.refreshToken?.token).toBe("refresh-1");
  });

  it("issues the refresh token in the session mode carried by the state", async () => {
    verifyGoogleStateMock.mockReturnValue({
      nonce: "nonce-1",
      redirect: "/",
      keepLoggedIn: false
    });
    parseCookiesMock.mockReturnValue(
      new Map([["flowledger_google_oauth_state", "nonce-1"]])
    );
    exchangeGoogleCodeMock.mockResolvedValue({} as never);
    verifyGoogleIdentityMock.mockResolvedValue({
      providerAccountId: "google-sub-1",
      email: "ada@example.com",
      name: "Ada",
      picture: undefined
    });
    issueRefreshTokenMock.mockResolvedValue({
      token: "refresh-1",
      expiresAt: new Date(),
      persistent: false
    });
    const tx = {
      userAuthAccount: {
        findUnique: vi.fn().mockResolvedValue({ user: { id: "user-1", email: "ada@example.com" } }),
        create: vi.fn()
      },
      user: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await handleGoogleCallback({ state: "state-token", cookieHeader: "x", code: "auth-code" });

    expect(issueRefreshTokenMock).toHaveBeenCalledWith("user-1", false);
  });

  it("refuses when an unlinked account has the email, creating no link, user or session", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/", keepLoggedIn: true });
    parseCookiesMock.mockReturnValue(
      new Map([["flowledger_google_oauth_state", "nonce-1"]])
    );
    exchangeGoogleCodeMock.mockResolvedValue({} as never);
    verifyGoogleIdentityMock.mockResolvedValue({
      providerAccountId: "google-sub-1",
      email: "ADA@example.com",
      name: "Ada",
      picture: undefined
    });
    issueRefreshTokenMock.mockClear();

    const tx = {
      userAuthAccount: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: "user-1" }),
        create: vi.fn()
      }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await expect(
      handleGoogleCallback({ state: "state-token", cookieHeader: "x", code: "auth-code" })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "ADA@example.com", mode: "insensitive" } }
      })
    );
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.userAuthAccount.create).not.toHaveBeenCalled();
    expect(issueRefreshTokenMock).not.toHaveBeenCalled();
  });

  it("creates a brand-new user when no account or email match exists", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/", keepLoggedIn: true });
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
      expiresAt: new Date(),
      persistent: true
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
        data: expect.objectContaining({
          email: "new@example.com",
          authAccounts: {
            create: expect.objectContaining({
              provider: "google",
              providerAccountId: "google-sub-2"
            })
          }
        })
      })
    );
  });

  describe("link mode", () => {
    function linkState() {
      verifyGoogleStateMock.mockReturnValue({
        nonce: "nonce-1",
        redirect: "/profile",
        keepLoggedIn: true,
        linkUserId: "user-1"
      });
      parseCookiesMock.mockReturnValue(new Map([["flowledger_google_oauth_state", "nonce-1"]]));
      exchangeGoogleCodeMock.mockResolvedValue({} as never);
      verifyGoogleIdentityMock.mockResolvedValue({
        providerAccountId: "google-sub-1",
        email: "other@example.com",
        name: "Ada",
        picture: undefined
      });
      issueRefreshTokenMock.mockClear();
    }

    function linkTx(identity: { userId: string } | null, userLink: { id: string } | null = null) {
      const tx = {
        userAuthAccount: {
          findUnique: vi.fn().mockResolvedValue(identity),
          findFirst: vi.fn().mockResolvedValue(userLink),
          create: vi.fn()
        }
      };
      (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
        typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
      );
      return tx;
    }

    const callback = () =>
      handleGoogleCallback({ state: "state-token", cookieHeader: "x", code: "auth-code" });

    it("links the identity to the signed-state user without issuing a session", async () => {
      linkState();
      const tx = linkTx(null);

      const result = await callback();

      expect(result).toEqual({ linkResult: "connected" });
      expect(tx.userAuthAccount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: "user-1", providerAccountId: "google-sub-1" })
      });
      expect(issueRefreshTokenMock).not.toHaveBeenCalled();
    });

    it("reports a conflict for an identity linked to another account", async () => {
      linkState();
      const tx = linkTx({ userId: "someone-else" });

      expect(await callback()).toEqual({ linkResult: "conflict" });
      expect(tx.userAuthAccount.create).not.toHaveBeenCalled();
    });

    it("reports a conflict when the user already linked a different identity", async () => {
      linkState();
      const tx = linkTx(null, { id: "link-1" });

      expect(await callback()).toEqual({ linkResult: "conflict" });
      expect(tx.userAuthAccount.create).not.toHaveBeenCalled();
    });

    it("treats the same identity on the same user as connected", async () => {
      linkState();
      const tx = linkTx({ userId: "user-1" });

      expect(await callback()).toEqual({ linkResult: "connected" });
      expect(tx.userAuthAccount.create).not.toHaveBeenCalled();
    });

    it("reports failure when Google returns an error or the exchange throws", async () => {
      linkState();
      linkTx(null);

      expect(
        await handleGoogleCallback({ state: "s", cookieHeader: "x", error: "access_denied" })
      ).toEqual({ linkResult: "failed" });

      exchangeGoogleCodeMock.mockRejectedValue(new Error("boom"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await callback()).toEqual({ linkResult: "failed" });
    });

    it("rejects a mismatched nonce before linking", async () => {
      linkState();
      parseCookiesMock.mockReturnValue(new Map([["flowledger_google_oauth_state", "wrong"]]));
      const tx = linkTx(null);

      await expect(callback()).rejects.toThrow("Invalid OAuth state");
      expect(tx.userAuthAccount.create).not.toHaveBeenCalled();
    });
  });
});

describe("hasGoogleLink", () => {
  it("reflects whether a Google link exists for the user", async () => {
    prismaMock.userAuthAccount.findFirst.mockResolvedValueOnce({ id: "link-1" } as never);
    expect(await hasGoogleLink("user-1")).toBe(true);

    prismaMock.userAuthAccount.findFirst.mockResolvedValueOnce(null);
    expect(await hasGoogleLink("user-1")).toBe(false);
  });
});
