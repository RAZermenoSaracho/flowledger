import type { Request, Response } from "express";
import { vi } from "vitest";

/** Builds a minimal fake `Request` for controller unit tests — `user`/`body`/`params`/`query` default to empty and can be overridden per test. */
export function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: "user-1", email: "user1@example.com" },
    body: {},
    params: {},
    query: {},
    ...overrides
  } as unknown as Request;
}

/** Builds a fake `Response` for controller unit tests: `status`/`json`/`send`/`setHeader`/`redirect` are chainable `vi.fn()` spies. */
export function mockResponse(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn();
  return res as Response;
}
