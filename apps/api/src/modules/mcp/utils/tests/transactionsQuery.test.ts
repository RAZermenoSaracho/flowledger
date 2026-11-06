import { describe, expect, it } from "vitest";
import { buildTransactionsQuery } from "../transactionsQuery.js";

describe("buildTransactionsQuery", () => {
  it("emits sort and pagination but no where for an empty search filter", () => {
    const query = JSON.parse(buildTransactionsQuery({ page: 1, pageSize: 50 }));
    expect(query).toEqual({
      sort: [{ field: "date", direction: "desc" }],
      pagination: { kind: "offset", page: 1, pageSize: 50 }
    });
  });

  it("maps every filter to an and-condition with a half-open date range", () => {
    const query = JSON.parse(
      buildTransactionsQuery({
        dateFrom: "2024-01-01",
        dateTo: "2024-01-31",
        accountId: "a1",
        categoryId: "c1",
        type: "expense",
        text: "coffee",
        page: 2,
        pageSize: 10
      })
    );
    expect(query.where.and).toEqual([
      { field: "date", op: ">=", value: "2024-01-01T00:00:00.000Z" },
      { field: "date", op: "<", value: "2024-02-01T00:00:00.000Z" },
      { field: "accountId", op: "=", value: "a1" },
      { field: "categoryId", op: "=", value: "c1" },
      { field: "type", op: "=", value: "expense" },
      { field: "name", op: "ilike", value: "coffee" }
    ]);
    expect(query.pagination).toEqual({ kind: "offset", page: 2, pageSize: 10 });
  });

  it("uses datetime bounds as given: dateFrom inclusive, dateTo exclusive", () => {
    const query = JSON.parse(
      buildTransactionsQuery({
        dateFrom: "2026-11-05T06:00:00.000Z",
        dateTo: "2026-11-06T06:00:00.000Z"
      })
    );
    expect(query.where.and).toEqual([
      { field: "date", op: ">=", value: "2026-11-05T06:00:00.000Z" },
      { field: "date", op: "<", value: "2026-11-06T06:00:00.000Z" }
    ]);
  });

  it("normalizes offset datetimes to UTC", () => {
    const query = JSON.parse(
      buildTransactionsQuery({
        dateFrom: "2026-11-05T00:00:00-06:00",
        dateTo: "2026-11-06T00:00:00-06:00"
      })
    );
    expect(query.where.and).toEqual([
      { field: "date", op: ">=", value: "2026-11-05T06:00:00.000Z" },
      { field: "date", op: "<", value: "2026-11-06T06:00:00.000Z" }
    ]);
  });

  it("omits sort and pagination for a summary filter", () => {
    const query = JSON.parse(buildTransactionsQuery({ type: "income" }));
    expect(query).toEqual({ where: { and: [{ field: "type", op: "=", value: "income" }] } });
  });
});
