import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { validate } from "../validate.js";

const schema = z.object({ name: z.string() });

describe("validate", () => {
  it("replaces req.body with the parsed value and calls next with no error, defaulting to 'body'", () => {
    const req = { body: { name: "Groceries" } } as unknown as Request;
    const next = vi.fn();

    validate(schema)(req, {} as never, next);

    expect(req.body).toEqual({ name: "Groceries" });
    expect(next).toHaveBeenCalledWith();
  });

  it("validates req.query when target is 'query'", () => {
    const req = { query: { name: "abc" } } as unknown as Request;
    const next = vi.fn();

    validate(schema, "query")(req, {} as never, next);

    expect(req.query).toEqual({ name: "abc" });
    expect(next).toHaveBeenCalledWith();
  });

  it("validates req.params when target is 'params'", () => {
    const req = { params: { name: "abc" } } as unknown as Request;
    const next = vi.fn();

    validate(schema, "params")(req, {} as never, next);

    expect(req.params).toEqual({ name: "abc" });
    expect(next).toHaveBeenCalledWith();
  });

  it("forwards a ZodError to next without mutating req when validation fails", () => {
    const req = { body: { name: 123 } } as unknown as Request;
    const next = vi.fn();

    validate(schema)(req, {} as never, next);

    expect(req.body).toEqual({ name: 123 });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(z.ZodError);
  });
});
