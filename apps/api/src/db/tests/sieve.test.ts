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
      {
        sort: { field: "name" },
        pagination: { kind: "offset", page: 1, pageSize: 5 }
      },
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

  it("clamps an oversized range limit and maps range onto skip/take", async () => {
    prismaMock.account.count.mockResolvedValue(0);
    prismaMock.account.findMany.mockResolvedValue([]);

    await sieve.query({
      pagination: { kind: "range", offset: 7, limit: 100000 }
    });
    expect(lastFindManyArgs()).toMatchObject({ skip: 7, take: 50 });

    await sieve.query({ pagination: { kind: "range", offset: 0, limit: 20 } });
    expect(lastFindManyArgs()).toMatchObject({ skip: 0, take: 20 });
  });

  it("rejects invalid range values with a 400", async () => {
    for (const pagination of [
      { kind: "range", offset: -1, limit: 10 },
      { kind: "range", offset: 0, limit: 0 },
      { kind: "range", offset: 0.5, limit: 10 }
    ]) {
      const error = await sieve.query({ pagination }).catch((e: unknown) => e);
      expect((error as HttpError).statusCode).toBe(400);
    }
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

    await sieve.query({
      sort: [{ field: "id", direction: "asc" }],
      pagination
    });
    expect(lastFindManyArgs().orderBy).toEqual([{ id: "asc" }]);
  });

  it("leaves unpaginated queries untouched", async () => {
    prismaMock.account.findMany.mockResolvedValue([]);

    await sieve.query({ sort: [{ field: "name", direction: "asc" }] });

    expect(lastFindManyArgs().orderBy).toEqual([{ name: "asc" }]);
    expect(lastFindManyArgs().take).toBeUndefined();
  });
});

describe("createSieve — operator validation", () => {
  const sieve = createSieve(prismaMock.account);

  async function rejection(query: unknown) {
    const error = await sieve.query(query).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBe(400);
  }

  it("rejects an unknown operator with a 400 and never queries", async () => {
    prismaMock.account.findMany.mockClear();
    await rejection({ where: { field: "userId", op: "eq", value: "u1" } });
    await rejection({ where: { field: "userId", value: "u1" } });
    await rejection({ where: { field: "userId", op: "childOf", value: "u1" } });
    expect(prismaMock.account.findMany).not.toHaveBeenCalled();
  });

  it("rejects an unknown operator nested in and/or/not", async () => {
    await rejection({
      where: {
        and: [{ field: "a", op: "=", value: 1 }, { or: [{ field: "b", op: "eq", value: 2 }] }]
      }
    });
    await rejection({ where: { not: { field: "a", op: "equals", value: 1 } } });
  });

  it("checks every branch of a node that combines and/or/not and op", async () => {
    const ok = { field: "a", op: "=", value: 1 };
    await rejection({ where: { and: [ok], or: [{ field: "b", op: "eq", value: 2 }] } });
    await rejection({ where: { and: [ok], not: { field: "b", op: "eq", value: 2 } } });
    await rejection({ where: { and: [ok], op: "eq", field: "c", value: 3 } });
    await rejection({ where: { and: { field: "b", op: "=", value: 2 } } });
    await rejection({ where: {} });
    await rejection({ where: null });
    await rejection({ include: { account: { where: { field: "b", op: "eq", value: 2 } } } });
  });

  it("never returns unscoped rows when a server scope filter is mistyped", async () => {
    prismaMock.account.findMany.mockResolvedValue([{ id: "other-users-row" }] as never);
    const scoped = {
      where: {
        and: [
          { field: "userId", op: "eq", value: "me" },
          { field: "name", op: "ilike", value: "x" }
        ]
      }
    };
    await expect(sieve.query(scoped)).rejects.toBeInstanceOf(HttpError);
  });

  it("leaves valid operators unchanged", async () => {
    prismaMock.account.findMany.mockResolvedValue([]);
    await sieve.query({
      where: {
        and: [{ field: "userId", op: "=", value: "u1" }, { not: { field: "name", op: "isNull" } }]
      }
    });
    expect(prismaMock.account.findMany.mock.calls.at(-1)?.[0]).toMatchObject({
      where: {
        AND: [{ userId: { equals: "u1" } }, { NOT: { name: { equals: null } } }]
      }
    });
  });
});
