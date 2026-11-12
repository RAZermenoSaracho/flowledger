import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { useAccountTransactions } from "../useAccountTransactions";

const API_URL = "http://localhost:4000";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAccountTransactions", () => {
  it("pages forward and back, never below page 1", async () => {
    const pages: number[] = [];
    server.use(
      http.get(`${API_URL}/transactions`, ({ request }) => {
        const query = JSON.parse(new URL(request.url).searchParams.get("query")!);
        pages.push(query.pagination.page);
        return HttpResponse.json({
          data: [],
          meta: { total: 40, page: query.pagination.page, pageSize: 20, pageCount: 2, hasNext: query.pagination.page < 2, hasPrevious: false, executionTime: 1 }
        });
      })
    );
    const { result } = renderHook(() => useAccountTransactions("acc-1"), { wrapper });

    await waitFor(() => expect(result.current.hasNext).toBe(true));
    expect(result.current.hasPrevious).toBe(false);
    act(() => result.current.goNext());
    await waitFor(() => expect(result.current.page).toBe(2));
    await waitFor(() => expect(result.current.hasNext).toBe(false));
    act(() => result.current.goPrevious());
    act(() => result.current.goPrevious());
    expect(result.current.page).toBe(1);
    expect(pages).toContain(2);
  });
});
