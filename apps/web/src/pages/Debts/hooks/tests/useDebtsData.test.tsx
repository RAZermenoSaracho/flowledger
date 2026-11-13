import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { useDebtsData } from "../useDebtsData";

const API_URL = "http://localhost:4000";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function category(id: string, type: "expense" | "income", groupId?: string) {
  return { id, name: id, type, groupId, isArchived: false, createdAt: "", updatedAt: "" };
}

describe("useDebtsData", () => {
  it("returns debts and accounts with private category options through the workflow", async () => {
    server.use(
      http.get(`${API_URL}/debts`, () =>
        HttpResponse.json({ balances: [], pendingSettlementRequests: [{ id: "request-1" }] })
      ),
      http.get(`${API_URL}/accounts`, () =>
        HttpResponse.json({ accounts: [{ id: "acc-1", name: "Checking" }] })
      ),
      http.get(`${API_URL}/categories`, () =>
        HttpResponse.json({
          categories: [
            category("exp", "expense"),
            category("inc", "income"),
            category("group-exp", "expense", "g-1"),
            category("group-inc", "income", "g-1")
          ]
        })
      ),
      http.get(`${API_URL}/groups`, () =>
        HttpResponse.json({ groups: [{ id: "g-1", name: "Trip" }] })
      )
    );

    const { result } = renderHook(() => useDebtsData(), { wrapper });

    await waitFor(() => expect(result.current.debtsQuery.isSuccess).toBe(true));
    expect(result.current.debtsQuery.data).toEqual({
      balances: [],
      pendingSettlementRequests: [{ id: "request-1" }]
    });
    const request = result.current.debtsQuery.data!.pendingSettlementRequests[0]!;
    await waitFor(() =>
      expect(result.current.workflow.incomeCategoryOptionsFor(request).map((c) => c.id))
        .toEqual(["inc"])
    );
    expect(result.current.workflow.expenseOffsetCategoryOptionsFor(request).map((c) => c.id))
      .toEqual(["exp"]);
    await waitFor(() =>
      expect(result.current.accounts).toEqual([{ id: "acc-1", name: "Checking" }])
    );
  });
});
