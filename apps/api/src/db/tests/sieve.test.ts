import { describe, expect, it } from "vitest";
import { prismaMock } from "../../tests/helpers/prismaMock.js";
import { HttpError } from "../../utils/httpError.js";
import { createSieve } from "../sieve.js";

function lastFindManyArgs() {
  return prismaMock.account.findMany.mock.calls.at(-1)?.[0] as {
    orderBy?: unknown;
    take?: number;
    skip?: number;
  };
}

describe("createSieve — pagination", () => {
  const sieve = createSieve(prismaMock.account, { maxPageSize: 50 });

  it("rejects invalid page or page size with a 400", async () => {
    for (const pagination of [
      { kind: "offset", page: 0, pageSize: 10 },
      { kind: "offset", page: 1, pageSize: 0 },
      { kind: "offset", page: 1, pageSize: 1.5 },
      { kind: "offset", page: 1, pageSize: "x" }
    ]) {
      const error = await sieve.query({ pagination }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(400);
    }
  });

  it("rejects a malformed sort with a 400, with or without pagination", async () => {
    for (const query of [
      { sort: { field: "name" }, pagination: { kind: "offset", page: 1, pageSize: 5 } },
      { sort: [null] },
      { sort: "name" },
      { sort: [{ field: "name", direction: "sideways" }] }
    ]) {
      const error = await sieve.query(query).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(400);
    }
  });

  it("clamps an oversized page size to maxPageSize", async () => {
    prismaMock.account.count.mockResolvedValue(0);
    prismaMock.account.findMany.mockResolvedValue([]);

    const result = await sieve.query({
      pagination: { kind: "offset", page: 1, pageSize: 100000 }
    });

    expect(lastFindManyArgs().take).toBe(50);
    expect(result.meta).toMatchObject({ pageSize: 50 });
  });

  it("appends the id tie-breaker in the last sort direction", async () => {
    prismaMock.account.count.mockResolvedValue(0);
    prismaMock.account.findMany.mockResolvedValue([]);

    await sieve.query({
      sort: [{ field: "name", direction: "asc" }],
      pagination: { kind: "offset", page: 1, pageSize: 5 }
    });

    expect(lastFindManyArgs().orderBy).toEqual([{ name: "asc" }, { id: "asc" }]);
  });

  it("sorts by id desc when no sort is given, and does not duplicate an existing id key", async () => {
    prismaMock.account.count.mockResolvedValue(0);
    prismaMock.account.findMany.mockResolvedValue([]);
    const pagination = { kind: "offset", page: 1, pageSize: 5 };

    await sieve.query({ pagination });
    expect(lastFindManyArgs().orderBy).toEqual([{ id: "desc" }]);

    await sieve.query({ sort: [{ field: "id", direction: "asc" }], pagination });
    expect(lastFindManyArgs().orderBy).toEqual([{ id: "asc" }]);
  });

  it("leaves unpaginated queries untouched", async () => {
    prismaMock.account.findMany.mockResolvedValue([]);

    await sieve.query({ sort: [{ field: "name", direction: "asc" }] });

    expect(lastFindManyArgs().orderBy).toEqual([{ name: "asc" }]);
    expect(lastFindManyArgs().take).toBeUndefined();
  });
});
