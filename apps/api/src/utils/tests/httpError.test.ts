import { describe, expect, it } from "vitest";
import { badRequest, HttpError, notFound } from "../httpError.js";

describe("HttpError", () => {
  it("carries statusCode, message, and optional details", () => {
    const error = new HttpError(422, "Invalid input", { field: "email" });
    expect(error.statusCode).toBe(422);
    expect(error.message).toBe("Invalid input");
    expect(error.details).toEqual({ field: "email" });
  });

  it("is a real Error instance", () => {
    expect(new HttpError(500, "oops")).toBeInstanceOf(Error);
  });
});

describe("notFound", () => {
  it("builds a 404 with a default 'Resource' name", () => {
    const error = notFound();
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("Resource not found");
  });

  it("builds a 404 naming the given resource", () => {
    const error = notFound("Account");
    expect(error.message).toBe("Account not found");
  });
});

describe("badRequest", () => {
  it("builds a 400 with the given message", () => {
    const error = badRequest("Missing field");
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Missing field");
    expect(error.details).toBeUndefined();
  });

  it("carries optional details", () => {
    const error = badRequest("Invalid", { field: "amount" });
    expect(error.details).toEqual({ field: "amount" });
  });
});
