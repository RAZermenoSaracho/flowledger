import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../../utils/httpError.js";
import { requireWebOrigin } from "../requireWebOrigin.js";

vi.mock("../../config/env.js", () => ({
  env: { WEB_APP_URL: "https://flowledger.example.com/" }
}));

function run(origin: string | undefined) {
  const next = vi.fn();
  requireWebOrigin({ header: () => origin } as unknown as Request, {} as never, next);
  return next;
}

describe("requireWebOrigin", () => {
  it.each(["https://other.example.com", "https://flowledger.example.com.evil.test", "null"])(
    "rejects origin %s with a 403",
    (origin) => {
      const error = run(origin).mock.calls[0]?.[0] as HttpError;

      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(403);
    }
  );

  it("passes the configured web app, even when the setting has a trailing slash", () => {
    expect(run("https://flowledger.example.com")).toHaveBeenCalledWith();
  });

  it("passes a request with no Origin", () => {
    expect(run(undefined)).toHaveBeenCalledWith();
  });
});
