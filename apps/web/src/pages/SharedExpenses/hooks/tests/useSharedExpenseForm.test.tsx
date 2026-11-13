import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { SharedExpense } from "../../../../types/sharedExpenses.types";
import { useSharedExpenseForm } from "../useSharedExpenseForm";

const API_URL = "http://localhost:4000";

const sharedExpense: SharedExpense = {
  id: "se-1",
  transactionId: "tx-1",
  ownerUserId: "user-1",
  title: "Dinner split",
  totalAmount: "100",
  status: "open",
  participants: [],
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

function setup(record: SharedExpense | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, ...renderHook(() => useSharedExpenseForm(record), { wrapper }) };
}

describe("useSharedExpenseForm", () => {
  it("has an empty draft while the shared expense loads", () => {
    const { result } = setup(null);
    expect(result.current.values).toEqual({});
    expect(result.current.isDirty).toBe(false);
  });

  it("loads title and status and tracks dirty keys", () => {
    const { result } = setup(sharedExpense);
    expect(result.current.values).toEqual({ title: "Dinner split", status: "open" });

    act(() => result.current.setField("status", "settled"));
    expect(result.current.changedKeys).toEqual(["status"]);
  });

  it("blocks save on a blank title", async () => {
    let called = false;
    server.use(
      http.put(`${API_URL}/shared-expenses/se-1`, () => {
        called = true;
        return HttpResponse.json({ sharedExpense });
      })
    );
    const { result } = setup(sharedExpense);

    act(() => result.current.setField("title", "   "));
    await act(() => result.current.save());

    expect(called).toBe(false);
    expect(result.current.fieldErrors.title).toBe("Title is required");
  });

  it("blocks save on a title over 160 characters", async () => {
    const { result } = setup(sharedExpense);

    act(() => result.current.setField("title", "a".repeat(161)));
    await act(() => result.current.save());

    expect(result.current.fieldErrors.title).toMatch(/at most 160/);
  });

  it("saves only the changed keys and invalidates the related queries", async () => {
    let body: unknown;
    server.use(
      http.put(`${API_URL}/shared-expenses/se-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ sharedExpense });
      })
    );
    const { result, invalidate } = setup(sharedExpense);

    act(() => result.current.setField("title", "  Lunch  "));
    await act(() => result.current.save());

    await waitFor(() => expect(body).toEqual({ title: "Lunch" }));
    const keys = invalidate.mock.calls.map((call) => (call[0] as { queryKey: string[] }).queryKey[0]);
    expect(keys).toEqual([
      "shared-expenses",
      "shared-expense",
      "debts",
      "transactions",
      "notifications"
    ]);
  });
});
