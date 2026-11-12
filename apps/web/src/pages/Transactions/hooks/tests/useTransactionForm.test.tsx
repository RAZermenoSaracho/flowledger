import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Transaction } from "../../../../types/transactions.types";
import { draftFromTransaction, newTransactionDraft } from "../../utils/transactionDraft";
import { useTransactionForm } from "../useTransactionForm";

const API_URL = "http://localhost:4000";
const stored = {
  id: "tx-1",
  name: "Groceries",
  amount: "42.5",
  executionCurrency: "USD",
  type: "expense",
  date: "2026-05-31T21:33:15.979Z"
} as Transaction;

function Probe() {
  return <span>{useLocation().pathname}</span>;
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/transactions/new"]}>
        <Routes>
          <Route path="*" element={<>{children}<Probe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("useTransactionForm", () => {
  it("has an empty draft while loading", () => {
    const { result } = renderHook(() => useTransactionForm({ initial: null, original: null }), { wrapper });
    expect(result.current.values).toEqual({});
  });

  it("blocks save of an invalid new draft", async () => {
    let called = false;
    server.use(
      http.post(`${API_URL}/transactions`, () => {
        called = true;
        return HttpResponse.json({ transaction: stored });
      })
    );
    const initial = newTransactionDraft("USD", "2026-11-05T14:30");
    const { result } = renderHook(() => useTransactionForm({ initial, original: null }), { wrapper });

    act(() => result.current.setField("notes", "x"));
    await act(() => result.current.save());

    expect(called).toBe(false);
    expect(result.current.fieldErrors.name).toBeDefined();
  });

  it("saves a changed existing transaction with one PUT of the changed fields", async () => {
    let body: unknown;
    server.use(
      http.put(`${API_URL}/transactions/tx-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ transaction: stored });
      })
    );
    const initial = draftFromTransaction(stored);
    const { result } = renderHook(() => useTransactionForm({ initial, original: stored }), { wrapper });

    act(() => result.current.setField("notes", "hello"));
    await act(() => result.current.save());

    expect(body).toEqual({ notes: "hello" });
    await waitFor(() => expect(result.current.isDirty).toBe(false));
  });

  it("lands on the created transaction after saving a new draft", async () => {
    server.use(http.post(`${API_URL}/transactions`, () => HttpResponse.json({ transaction: { id: "tx-9" } })));
    const initial = newTransactionDraft("USD", "2026-11-05T14:30");
    const { result } = renderHook(() => useTransactionForm({ initial, original: null }), { wrapper });

    act(() => result.current.update((d) => ({ ...d, name: "Dinner", amount: "10" })));
    await act(() => result.current.save());

    await waitFor(() => expect(document.body).toHaveTextContent("/transactions/tx-9"));
  });

  it("puts a server field error on that field and keeps the draft", async () => {
    server.use(
      http.put(`${API_URL}/transactions/tx-1`, () =>
        HttpResponse.json({ message: "Too low", issues: { fieldErrors: { amount: ["Too low"] } } }, { status: 400 })
      )
    );
    const initial = draftFromTransaction(stored);
    const { result } = renderHook(() => useTransactionForm({ initial, original: stored }), { wrapper });

    act(() => result.current.setField("amount", "1"));
    await act(() => result.current.save());

    expect(result.current.fieldErrors.amount).toBe("Too low");
    expect(result.current.values.amount).toBe("1");
  });
});
