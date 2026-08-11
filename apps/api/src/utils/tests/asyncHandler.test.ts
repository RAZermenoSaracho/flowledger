import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { asyncHandler } from "../asyncHandler.js";

describe("asyncHandler", () => {
  it("does not call next when the wrapped handler resolves", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const next = vi.fn() as NextFunction;

    asyncHandler(handler)({} as Request, {} as Response, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).not.toHaveBeenCalled();
  });

  it("forwards a rejected promise's error to next", async () => {
    const error = new Error("boom");
    const handler = vi.fn().mockRejectedValue(error);
    const next = vi.fn() as NextFunction;

    asyncHandler(handler)({} as Request, {} as Response, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalledWith(error);
  });

  it("passes req/res/next through to the wrapped handler", () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const req = { id: "req-1" } as unknown as Request;
    const res = { id: "res-1" } as unknown as Response;
    const next = vi.fn() as NextFunction;

    asyncHandler(handler)(req, res, next);

    expect(handler).toHaveBeenCalledWith(req, res, next);
  });
});
