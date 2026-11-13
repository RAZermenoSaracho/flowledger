import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Account } from "../../../../types/accounts.types";
import { useAccountForm } from "../useAccountForm";

const API_URL = "http://localhost:4000";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const account: Account = {
  id: "acc-1",
  name: "Checking",
  type: "checking",
  identifier: "1234",
  currency: "USD",
  initialBalance: "500",
  isArchived: false,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

describe("useAccountForm", () => {
  it("has an empty draft while the account is loading", () => {
    const { result } = renderHook(() => useAccountForm(null), { wrapper });
    expect(result.current.values).toEqual({});
    expect(result.current.isDirty).toBe(false);
  });

  it("loads values from the account and tracks dirty state", () => {
    const { result } = renderHook(() => useAccountForm(account), { wrapper });
    expect(result.current.values).toEqual({
      name: "Checking",
      type: "checking",
      identifier: "1234",
      currency: "USD",
      initialBalance: "500"
    });

    act(() => result.current.setField("name", "Everyday"));
    expect(result.current.isDirty).toBe(true);
    expect(result.current.changedKeys).toEqual(["name"]);
  });

  it("blocks save and shows the error when the name is empty", async () => {
    let called = false;
    server.use(
      http.put(`${API_URL}/accounts/acc-1`, () => {
        called = true;
        return HttpResponse.json({ account });
      })
    );
    const { result } = renderHook(() => useAccountForm(account), { wrapper });

    act(() => result.current.setField("name", ""));
    await act(() => result.current.save());

    expect(called).toBe(false);
    expect(result.current.fieldErrors.name).toBeTruthy();
  });

  it("saves only the changed fields in one request, blank identifier as null", async () => {
    let body: unknown;
    server.use(
      http.put(`${API_URL}/accounts/acc-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ account });
      })
    );
    const { result } = renderHook(() => useAccountForm(account), { wrapper });

    act(() => {
      result.current.setField("name", "Everyday");
      result.current.setField("identifier", "");
      result.current.setField("initialBalance", "75.5");
    });
    await act(() => result.current.save());

    expect(body).toEqual({
      name: "Everyday",
      identifier: null,
      initialBalance: "75.5"
    });
    await waitFor(() => expect(result.current.isDirty).toBe(false));
  });

  it("keeps the draft and exposes the error when the server rejects", async () => {
    server.use(
      http.put(`${API_URL}/accounts/acc-1`, () =>
        HttpResponse.json({ error: { message: "Nope" } }, { status: 500 })
      )
    );
    const { result } = renderHook(() => useAccountForm(account), { wrapper });

    act(() => result.current.setField("name", "Everyday"));
    await act(() => result.current.save());

    expect(result.current.saveError).toBeTruthy();
    expect(result.current.values.name).toBe("Everyday");
    expect(result.current.isDirty).toBe(true);
  });
});
