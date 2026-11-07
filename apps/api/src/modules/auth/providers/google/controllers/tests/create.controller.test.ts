import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../../../tests/helpers/httpMocks.js";

vi.mock("../../../../../../config/env.js", () => ({
  env: { WEB_APP_URL: "http://localhost:5173" }
}));

vi.mock("../../services/create.service.js", () => ({
  buildGoogleAuthUrl: vi.fn(),
  handleGoogleCallback: vi.fn(),
  hasGoogleLink: vi.fn()
}));

vi.mock("../../utils/googleStateCookie.js", () => ({
  googleStateCookie: vi.fn()
}));

vi.mock("../../../../utils/refreshTokenCookie.js", () => ({
  buildSessionCookies: vi.fn()
}));

const { buildGoogleAuthUrl, handleGoogleCallback, hasGoogleLink } = await import(
  "../../services/create.service.js"
);
const { googleStateCookie } = await import("../../utils/googleStateCookie.js");
const { buildSessionCookies } = await import("../../../../utils/refreshTokenCookie.js");
const { googleLinkStart, googleLinkStatus, googleOAuthCallback, googleOAuthStart } = await import(
  "../create.controller.js"
);

describe("googleOAuthStart", () => {
  it("sets a state cookie and redirects to the Google consent URL", async () => {
    vi.mocked(googleStateCookie).mockReturnValue("google-state-cookie");
    vi.mocked(buildGoogleAuthUrl).mockReturnValue({
      nonce: "nonce-1",
      url: "https://accounts.google.com/o/oauth2/v2/auth?x=1"
    });
    const res = mockResponse();

    await googleOAuthStart(mockRequest({ query: { redirect: "/dashboard" } }), res);

    expect(buildGoogleAuthUrl).toHaveBeenCalledWith("/dashboard", true);
    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", "google-state-cookie");
    expect(res.redirect).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?x=1"
    );
  });

  it("passes keepLoggedIn=false when the query says \"false\"", async () => {
    vi.mocked(buildGoogleAuthUrl).mockReturnValue({ nonce: "n", url: "https://x" });

    await googleOAuthStart(
      mockRequest({ query: { redirect: "/", keepLoggedIn: "false" } }),
      mockResponse()
    );

    expect(buildGoogleAuthUrl).toHaveBeenCalledWith("/", false);
  });

  it("passes keepLoggedIn=true when the query says \"true\"", async () => {
    vi.mocked(buildGoogleAuthUrl).mockReturnValue({ nonce: "n", url: "https://x" });

    await googleOAuthStart(
      mockRequest({ query: { redirect: "/", keepLoggedIn: "true" } }),
      mockResponse()
    );

    expect(buildGoogleAuthUrl).toHaveBeenCalledWith("/", true);
  });
});

describe("googleOAuthCallback", () => {
  it("redirects to the web app with a token fragment on success", async () => {
    vi.mocked(handleGoogleCallback).mockResolvedValue({
      token: "access-token",
      refreshToken: { token: "refresh-token", expiresAt: new Date(), persistent: false },
      redirect: "/dashboard"
    });
    vi.mocked(googleStateCookie).mockReturnValue("cleared-state");
    vi.mocked(buildSessionCookies).mockReturnValue(["refresh=x", "presence=1"]);
    const res = mockResponse();

    await googleOAuthCallback(
      mockRequest({ query: { state: "state-1", code: "code-1" }, headers: {} } as never),
      res
    );

    expect(buildSessionCookies).toHaveBeenCalledWith(
      expect.objectContaining({ token: "refresh-token", persistent: false })
    );
    expect(googleStateCookie).toHaveBeenCalledWith("", 0);
    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", [
      "cleared-state",
      "refresh=x",
      "presence=1"
    ]);
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining("/auth/oauth/callback")
    );
  });

  it("redirects to the login page with an error on failure, without throwing", async () => {
    vi.mocked(handleGoogleCallback).mockRejectedValue(new Error("boom"));
    const res = mockResponse();

    await googleOAuthCallback(
      mockRequest({ query: { state: "state-1" }, headers: {} } as never),
      res
    );

    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining("/login")
    );
  });
});

describe("googleLinkStart", () => {
  it("binds the flow to the signed-in user, sets the state cookie, and returns the URL", async () => {
    vi.mocked(buildGoogleAuthUrl).mockReturnValue({ nonce: "n", url: "https://google.test/a" });
    vi.mocked(googleStateCookie).mockReturnValue("state-cookie");
    const res = mockResponse();

    await googleLinkStart(mockRequest({ user: { id: "user-1", email: "a@example.com" } }), res);

    expect(buildGoogleAuthUrl).toHaveBeenCalledWith("/profile", true, "user-1");
    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", "state-cookie");
    expect(res.json).toHaveBeenCalledWith({ url: "https://google.test/a" });
  });
});

describe("googleLinkStatus", () => {
  it("reports the connection for the signed-in user", async () => {
    vi.mocked(hasGoogleLink).mockResolvedValue(true);
    const res = mockResponse();

    await googleLinkStatus(mockRequest({ user: { id: "user-1", email: "a@example.com" } }), res);

    expect(hasGoogleLink).toHaveBeenCalledWith("user-1");
    expect(res.json).toHaveBeenCalledWith({ connected: true });
  });
});

describe("googleOAuthCallback in link mode", () => {
  it("returns to Profile with the result and sets no session cookie", async () => {
    vi.mocked(handleGoogleCallback).mockResolvedValue({ linkResult: "conflict" } as never);
    vi.mocked(buildSessionCookies).mockClear();
    vi.mocked(googleStateCookie).mockReturnValue("cleared-state");
    const res = mockResponse();

    await googleOAuthCallback(mockRequest({ query: { state: "s", code: "c" }, headers: {} }), res);

    expect(buildSessionCookies).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", "cleared-state");
    expect(res.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/profile?tab=security&googleLink=conflict"
    );
  });
});
