import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../tests/mocks/server";
import type { RelatedTransactionsScope } from "../../types/transactions.types";
import { useRelatedTransactions } from "../useRelatedTransactions";

const API_URL = "http://localhost:4000";

type Query = { where: unknown; sort: unknown; pagination: { page: number; pageSize: number } };

function meta(page: number) {
  return { total: 40, page, pageSize: 20, pageCount: 2, hasNext: page < 2, hasPrevious: page > 1, executionTime: 1 };
}

function mockTransactions(status = 200) {
  const queries: Query[] = [];
  server.use(
    http.get(`${API_URL}/transactions`, ({ request }) => {
      const query = JSON.parse(new URL(request.url).searchParams.get("query")!);
      queries.push(query);
      if (status !== 200) return new HttpResponse(null, { status });
      return HttpResponse.json({ data: [], meta: meta(query.pagination.page) });
    })
  );
  return queries;
}

function render(scope: RelatedTransactionsScope) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(({ scope }) => useRelatedTransactions(scope), {
    wrapper,
    initialProps: { scope }
  });
}

const accountScope: RelatedTransactionsScope = { field: "accountId", value: "a1" };

describe("useRelatedTransactions", () => {
  it("requests the scope condition, date desc, page 1 of 20", async () => {
    const queries = mockTransactions();
    const { result } = render(accountScope);
    await waitFor(() => expect(result.current.meta).not.toBeNull());
    expect(queries[0]).toEqual({
      where: { field: "accountId", op: "=", value: "a1" },
      sort: [{ field: "date", direction: "desc" }],
      pagination: { kind: "offset", page: 1, pageSize: 20 }
    });
  });

  it("ANDs the search where with the scope condition", async () => {
    const queries = mockTransactions();
    const { result } = render(accountScope);
    await waitFor(() => expect(result.current.meta).not.toBeNull());
    const search = { field: "name", op: "ilike" as const, value: "cof" };
    act(() => result.current.setSearch({ where: search }));
    await waitFor(() =>
      expect(queries.at(-1)?.where).toEqual({
        and: [{ field: "accountId", op: "=", value: "a1" }, search]
      })
    );
  });

  it("moves to the next page and resets to page 1 on a scope or search change", async () => {
    const queries = mockTransactions();
    const { result, rerender } = render(accountScope);
    await waitFor(() => expect(result.current.paging.pageCount).toBe(2));
    expect(result.current.paging.hasNext).toBe(true);
    act(() => result.current.paging.setPage(2));
    await waitFor(() => expect(queries.at(-1)?.pagination.page).toBe(2));

    rerender({ scope: { field: "groupId", value: "g1" } });
    await waitFor(() => expect(queries.at(-1)?.where).toMatchObject({ field: "groupId" }));
    expect(result.current.paging.page).toBe(1);

    act(() => result.current.paging.setPage(2));
    await waitFor(() => expect(result.current.paging.page).toBe(2));
    act(() => result.current.setSearch({ where: { field: "name", op: "ilike", value: "x" } }));
    await waitFor(() => expect(result.current.paging.page).toBe(1));
  });

  it("reports an error message when the request fails", async () => {
    mockTransactions(500);
    const { result } = render(accountScope);
    await waitFor(() => expect(result.current.error).toBe("Could not load transactions."));
  });
});
