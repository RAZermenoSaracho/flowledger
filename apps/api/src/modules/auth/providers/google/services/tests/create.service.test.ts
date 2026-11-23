import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../../../../utils/httpError.js";
import { prismaMock } from "../../../../../../tests/helpers/prismaMock.js";

vi.mock("../../utils/googleState.js", () => ({
  signGoogleState: vi.fn(),
  verifyGoogleState: vi.fn(),
  signGoogleLinkPending: vi.fn(),
  verifyGoogleLinkPending: vi.fn()
}));

vi.mock("../../utils/googleStateCookie.js", () => ({
  googleStateCookieName: "flowledger_google_oauth_state",
  googleLinkPendingCookieName: "flowledger_google_link_pending",
  parseCookies: vi.fn()
}));

vi.mock("../google.client.js", () => ({
  exchangeGoogleCode: vi.fn(),
  verifyGoogleIdentity: vi.fn()
}));

vi.mock("../../../../services/create.service.js", () => ({
  issueRefreshToken: vi.fn()
}));

const {
  signGoogleLinkPending,
  signGoogleState,
  verifyGoogleLinkPending,
  verifyGoogleState
} = await import("../../utils/googleState.js");
const { parseCookies } = await import("../../utils/googleStateCookie.js");
const { exchangeGoogleCode, verifyGoogleIdentity } = await import("../google.client.js");
const { issueRefreshToken } = await import("../../../../services/create.service.js");

const signGoogleStateMock = vi.mocked(signGoogleState);
const verifyGoogleStateMock = vi.mocked(verifyGoogleState);
const signGoogleLinkPendingMock = vi.mocked(signGoogleLinkPending);
const verifyGoogleLinkPendingMock = vi.mocked(verifyGoogleLinkPending);
const parseCookiesMock = vi.mocked(parseCookies);
const exchangeGoogleCodeMock = vi.mocked(exchangeGoogleCode);
const verifyGoogleIdentityMock = vi.mocked(verifyGoogleIdentity);
const issueRefreshTokenMock = vi.mocked(issueRefreshToken);

const { buildGoogleAuthUrl, completeGoogleLink, handleGoogleCallback, hasGoogleLink } = await import(
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
    expect(result).toMatchObject({ redirect: "/dashboard", refreshToken: { token: "refresh-1" } });
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
          username: expect.stringMatching(/^user_[a-z0-9]{12}$/),
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

  it("retries the whole transaction with a new username when the generated one collides", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/", keepLoggedIn: true });
    parseCookiesMock.mockReturnValue(new Map([["flowledger_google_oauth_state", "nonce-1"]]));
    exchangeGoogleCodeMock.mockResolvedValue({} as never);
    verifyGoogleIdentityMock.mockResolvedValue({
      providerAccountId: "google-sub-3",
      email: "dup@example.com",
      name: "Dup",
      picture: undefined
    });
    issueRefreshTokenMock.mockResolvedValue({ token: "r", expiresAt: new Date(), persistent: true });
    const create = vi
      .fn()
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x", meta: { target: ["username"] } })
      )
      .mockResolvedValue({ id: "user-new", email: "dup@example.com", avatarUrl: null });
    const tx = {
      userAuthAccount: { findUnique: vi.fn().mockResolvedValue(null) },
      user: { findFirst: vi.fn().mockResolvedValue(null), create }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    await handleGoogleCallback({ state: "state-token", cookieHeader: "x", code: "auth-code" });

    expect(create).toHaveBeenCalledTimes(2);
    const usernames = create.mock.calls.map((c) => c[0].data.username);
    expect(usernames[0]).not.toBe(usernames[1]);
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

    it("returns a pending token without writing a link or issuing a session", async () => {
      linkState();
      const tx = linkTx(null);
      signGoogleLinkPendingMock.mockReturnValue("pending-jwt");

      const result = await callback();

      expect(result).toEqual({ linkResult: "pending", pendingToken: "pending-jwt" });
      expect(signGoogleLinkPendingMock).toHaveBeenCalledWith({
        linkUserId: "user-1",
        providerAccountId: "google-sub-1",
        email: "other@example.com"
      });
      expect(tx.userAuthAccount.create).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(issueRefreshTokenMock).not.toHaveBeenCalled();
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

  it("never returns a pending token in sign-in mode", async () => {
    verifyGoogleStateMock.mockReturnValue({ nonce: "nonce-1", redirect: "/", keepLoggedIn: true });
    parseCookiesMock.mockReturnValue(new Map([["flowledger_google_oauth_state", "nonce-1"]]));
    exchangeGoogleCodeMock.mockResolvedValue({} as never);
    verifyGoogleIdentityMock.mockResolvedValue({
      providerAccountId: "google-sub-1",
      email: "ada@example.com",
      name: "Ada",
      picture: undefined
    });
    issueRefreshTokenMock.mockResolvedValue({ token: "r", expiresAt: new Date(), persistent: true });
    const tx = {
      userAuthAccount: {
        findUnique: vi.fn().mockResolvedValue({ user: { id: "user-1" } })
      }
    };
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );

    const result = await handleGoogleCallback({ state: "s", cookieHeader: "x", code: "c" });

    expect(result).not.toHaveProperty("pendingToken");
    expect(result).not.toHaveProperty("linkResult");
    expect(signGoogleLinkPendingMock).not.toHaveBeenCalled();
  });
});

describe("completeGoogleLink", () => {
  function pendingCookie(linkUserId = "user-1") {
    parseCookiesMock.mockReturnValue(
      new Map([["flowledger_google_link_pending", "pending-jwt"]])
    );
    verifyGoogleLinkPendingMock.mockReturnValue({
      linkUserId,
      providerAccountId: "google-sub-1",
      email: "other@example.com"
    });
  }

  function linkTx(identity: { userId: string } | null, userLink: { id: string } | null = null) {
    const tx = {
      userAuthAccount: {
        findUnique: vi.fn().mockResolvedValue(identity),
        findFirst: vi.fn().mockResolvedValue(userLink),
        create: vi.fn()
      }
    };
    prismaMock.$transaction.mockClear();
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(tx) : Promise.resolve(arg)
    );
    return tx;
  }

  it("links the identity for the matching user", async () => {
    pendingCookie();
    const tx = linkTx(null);

    expect(await completeGoogleLink("user-1", "cookie")).toBe("connected");
    expect(tx.userAuthAccount.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        provider: "google",
        providerAccountId: "google-sub-1",
        email: "other@example.com"
      }
    });
  });

  it("rejects a mismatched user with a generic 400, logging no identifiers", async () => {
    pendingCookie("user-1");
    const tx = linkTx(null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(completeGoogleLink("user-2", "cookie")).rejects.toMatchObject({
      statusCode: 400,
      message: "Google could not be connected"
    });
    expect(tx.userAuthAccount.create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("Google link completion rejected: user mismatch");
    warn.mockRestore();
  });

  it("rejects a missing cookie with a generic 400", async () => {
    parseCookiesMock.mockReturnValue(new Map());
    const tx = linkTx(null);

    await expect(completeGoogleLink("user-1", undefined)).rejects.toMatchObject({
      statusCode: 400,
      message: "Google could not be connected"
    });
    expect(tx.userAuthAccount.create).not.toHaveBeenCalled();
  });

  it("propagates the 400 for an expired or forged cookie", async () => {
    parseCookiesMock.mockReturnValue(
      new Map([["flowledger_google_link_pending", "forged"]])
    );
    verifyGoogleLinkPendingMock.mockImplementation(() => {
      throw new HttpError(400, "Google could not be connected");
    });
    const tx = linkTx(null);

    await expect(completeGoogleLink("user-1", "cookie")).rejects.toMatchObject({
      statusCode: 400
    });
    expect(tx.userAuthAccount.create).not.toHaveBeenCalled();
  });

  it("reports a conflict for an identity linked to another account", async () => {
    pendingCookie();
    const tx = linkTx({ userId: "someone-else" });

    expect(await completeGoogleLink("user-1", "cookie")).toBe("conflict");
    expect(tx.userAuthAccount.create).not.toHaveBeenCalled();
  });

  it("reports a conflict when the user already linked a different identity", async () => {
    pendingCookie();
    const tx = linkTx(null, { id: "link-1" });

    expect(await completeGoogleLink("user-1", "cookie")).toBe("conflict");
    expect(tx.userAuthAccount.create).not.toHaveBeenCalled();
  });

  it("treats a repeated completion of the same identity as connected", async () => {
    pendingCookie();
    const tx = linkTx({ userId: "user-1" });

    expect(await completeGoogleLink("user-1", "cookie")).toBe("connected");
    expect(await completeGoogleLink("user-1", "cookie")).toBe("connected");
    expect(tx.userAuthAccount.create).not.toHaveBeenCalled();
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
