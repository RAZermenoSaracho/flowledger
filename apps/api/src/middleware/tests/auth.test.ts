import type { Request } from "express";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";
import { signGoogleState } from "../../modules/auth/providers/google/utils/googleState.js";
import { signAccessToken } from "../../modules/auth/utils/tokens.js";
import { HttpError } from "../../utils/httpError.js";
import { requireAuth } from "../auth.js";

function mockRequest(headerValue: string | undefined): Request {
  return {
    header: vi.fn().mockReturnValue(headerValue)
  } as unknown as Request;
}

describe("requireAuth", () => {
  it("attaches req.user from a valid Bearer token and calls next with no error", () => {
    const token = signAccessToken({ id: "user-1", email: "user1@example.com" });
    const req = mockRequest(`Bearer ${token}`);
    const next = vi.fn();

    requireAuth(req, {} as never, next);

    expect(req.user).toEqual({ id: "user-1", email: "user1@example.com" });
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects with a 401 when the Authorization header is missing", () => {
    const req = mockRequest(undefined);
    const next = vi.fn();

    requireAuth(req, {} as never, next);

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("Authentication required");
  });

  it("rejects with a 401 when the header doesn't start with 'Bearer '", () => {
    const req = mockRequest("Basic abc123");
    const next = vi.fn();

    requireAuth(req, {} as never, next);

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("Authentication required");
  });

  it("rejects with a 401 when the token is invalid", () => {
    const req = mockRequest("Bearer not-a-real-token");
    const next = vi.fn();

    requireAuth(req, {} as never, next);

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("Invalid or expired token");
  });

  it("rejects with a 401 when the token is expired", () => {
    const token = jwt.sign(
      { email: "user1@example.com" },
      env.JWT_SECRET,
      { subject: "user-1", audience: "flowledger-access", expiresIn: -1 }
    );
    const req = mockRequest(`Bearer ${token}`);
    const next = vi.fn();

    requireAuth(req, {} as never, next);

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("Invalid or expired token");
  });

  const accessAudience = "flowledger-access";
  it.each<[string, () => string]>([
    [
      "a Google state token",
      () => signGoogleState({ nonce: "n", redirect: "/", keepLoggedIn: true })
    ],
    [
      "a consent-audience token with a subject",
      () => jwt.sign({ email: "a@example.com" }, env.JWT_SECRET, { subject: "user-1", audience: "oauth-consent" })
    ],
    [
      "a token with no audience",
      () => jwt.sign({ email: "a@example.com" }, env.JWT_SECRET, { subject: "user-1" })
    ],
    [
      "a missing subject",
      () => jwt.sign({ email: "a@example.com" }, env.JWT_SECRET, { audience: accessAudience })
    ],
    [
      "an empty subject",
      () => jwt.sign({ email: "a@example.com", sub: "" }, env.JWT_SECRET, { audience: accessAudience })
    ],
    [
      "a non-string subject",
      () => jwt.sign({ email: "a@example.com", sub: 42 }, env.JWT_SECRET, { audience: accessAudience })
    ],
    [
      "a missing email",
      () => jwt.sign({}, env.JWT_SECRET, { subject: "user-1", audience: accessAudience })
    ],
    [
      "a wrong algorithm",
      () =>
        jwt.sign({ email: "a@example.com" }, env.JWT_SECRET, {
          subject: "user-1",
          audience: accessAudience,
          algorithm: "HS512"
        })
    ]
  ])("rejects %s with a 401 and leaves req.user unset", (_label, makeToken) => {
    const req = mockRequest(`Bearer ${makeToken()}`);
    const next = vi.fn();

    requireAuth(req, {} as never, next);

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error.statusCode).toBe(401);
    expect(req.user).toBeUndefined();
  });
});
