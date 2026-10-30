import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { mockResponse } from "../../../../tests/helpers/httpMocks.js";
import { originGuard } from "../originGuard.js";

const req = (origin?: string) => ({ header: () => origin }) as unknown as Request;

describe("originGuard", () => {
  it("responds 403 when an Origin header is present", () => {
    const res = mockResponse();
    const next = vi.fn();
    originGuard(req("https://evil.example"), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes requests without Origin", () => {
    const next = vi.fn();
    originGuard(req(), mockResponse(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
