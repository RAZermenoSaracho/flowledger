import type { Request } from "express";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";
import { requireAuth } from "../auth.js";

function mockRequest(headerValue: string | undefined): Request {
  return {
    header: vi.fn().mockReturnValue(headerValue)
  } as unknown as Request;
}

describe("requireAuth", () => {
  it("attaches req.user from a valid Bearer token and calls next with no error", () => {
    const token = jwt.sign(
      { email: "user1@example.com" },
      env.JWT_SECRET,
      { subject: "user-1" }
    );
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
      { subject: "user-1", expiresIn: -1 }
    );
    const req = mockRequest(`Bearer ${token}`);
    const next = vi.fn();

    requireAuth(req, {} as never, next);

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("Invalid or expired token");
  });
});
