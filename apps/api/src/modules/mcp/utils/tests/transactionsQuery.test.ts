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

  it("maps every filter to an and-condition with an inclusive end date", () => {
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
      { field: "date", op: "<=", value: "2024-01-31T23:59:59.999Z" },
      { field: "accountId", op: "=", value: "a1" },
      { field: "categoryId", op: "=", value: "c1" },
      { field: "type", op: "=", value: "expense" },
      { field: "name", op: "ilike", value: "coffee" }
    ]);
    expect(query.pagination).toEqual({ kind: "offset", page: 2, pageSize: 10 });
  });

  it("omits sort and pagination for a summary filter", () => {
    const query = JSON.parse(buildTransactionsQuery({ type: "income" }));
    expect(query).toEqual({ where: { and: [{ field: "type", op: "=", value: "income" }] } });
  });
});
