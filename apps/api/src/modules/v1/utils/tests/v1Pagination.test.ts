import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { clampV1Pagination } from "../v1Pagination.js";

function run(query: unknown) {
  const req = { query: query === undefined ? {} : { query: JSON.stringify(query) } } as unknown as Request;
  const next = vi.fn();
  clampV1Pagination(req, {} as never, next);
  return { req, next, parsed: req.query.query ? JSON.parse(req.query.query as string) : undefined };
}

describe("clampV1Pagination", () => {
  it("applies page 1 / size 50 when the query is omitted", () => {
    const { next, parsed } = run(undefined);
    expect(next).toHaveBeenCalledWith();
    expect(parsed.pagination).toEqual({ kind: "offset", page: 1, pageSize: 50 });
  });

  it("clamps an oversized pageSize to 100 and keeps other keys", () => {
    const where = { field: "type", op: "=", value: "expense" };
    const { parsed } = run({ where, pagination: { kind: "offset", page: 2, pageSize: 500 } });
    expect(parsed.pagination).toEqual({ kind: "offset", page: 2, pageSize: 100 });
    expect(parsed.where).toEqual(where);
  });

  it("rejects pageSize below 1", () => {
    expect(run({ pagination: { pageSize: 0 } }).next.mock.calls[0]![0]).toMatchObject({ statusCode: 400 });
  });

  it("rejects non-offset pagination", () => {
    expect(run({ pagination: { kind: "cursor" } }).next.mock.calls[0]![0]).toMatchObject({ statusCode: 400 });
  });

  it("rejects invalid JSON and non-objects", () => {
    const next = vi.fn();
    clampV1Pagination({ query: { query: "{nope" } } as unknown as Request, {} as never, next);
    expect(next.mock.calls[0]![0]).toMatchObject({ statusCode: 400 });
    expect(run([1]).next.mock.calls[0]![0]).toMatchObject({ statusCode: 400 });
  });
});
