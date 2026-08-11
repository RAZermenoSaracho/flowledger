import { ParseError, QueryValidationError } from "datasieve";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { mockResponse } from "../../tests/helpers/httpMocks.js";
import { HttpError } from "../../utils/httpError.js";
import { errorHandler } from "../errorHandler.js";

describe("errorHandler", () => {
  it("maps a ZodError to a 400 with flattened issues", () => {
    const res = mockResponse();
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });

    errorHandler(result.error, {} as never, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Validation failed",
      issues: expect.objectContaining({ fieldErrors: expect.anything() })
    });
  });

  it("maps a datasieve ParseError to a 400 with its issues", () => {
    const res = mockResponse();
    const error = new ParseError("bad filter", [{ path: "amount" }] as never);

    errorHandler(error, {} as never, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "bad filter",
      issues: [{ path: "amount" }]
    });
  });

  it("maps a datasieve QueryValidationError to a 400 with its issues", () => {
    const res = mockResponse();
    const error = new QueryValidationError("invalid query", [
      { path: "sort" }
    ] as never);

    errorHandler(error, {} as never, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "invalid query",
      issues: [{ path: "sort" }]
    });
  });

  it("maps an HttpError to its status code and message", () => {
    const res = mockResponse();
    const error = new HttpError(404, "Thing not found");

    errorHandler(error, {} as never, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Thing not found" });
  });

  it("spreads object HttpError details into the response body", () => {
    const res = mockResponse();
    const error = new HttpError(400, "Batch failed", { failedIds: ["a", "b"] });

    errorHandler(error, {} as never, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith({
      message: "Batch failed",
      failedIds: ["a", "b"]
    });
  });

  it("omits non-object HttpError details from the response body", () => {
    const res = mockResponse();
    const error = new HttpError(400, "Bad input", "not an object");

    errorHandler(error, {} as never, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith({ message: "Bad input" });
  });

  it("logs and returns a 500 for an unrecognized error", () => {
    const res = mockResponse();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("boom");

    errorHandler(error, {} as never, res, vi.fn());

    expect(consoleSpy).toHaveBeenCalledWith(error);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Internal server error" });
    consoleSpy.mockRestore();
  });
});
