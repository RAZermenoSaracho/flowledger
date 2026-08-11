import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Account } from "../../../../types/accounts.types";
import { useAccountEditForm } from "../useAccountEditForm";

const API_URL = "http://localhost:4000";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Checking",
    type: "checking",
    identifier: "1234",
    currency: "USD",
    initialBalance: 500,
    isArchived: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("useAccountEditForm", () => {
  it("starts with no editingAccountId and default field values", () => {
    const { result } = renderHook(() => useAccountEditForm(), { wrapper });
    expect(result.current.editingAccountId).toBeNull();
    expect(result.current.editType).toBe("checking");
    expect(result.current.editCurrency).toBe("USD");
    expect(result.current.editInitialBalance).toBe("0");
  });

  it("openEditForm populates fields from the account, closeEditForm resets them", () => {
    const { result } = renderHook(() => useAccountEditForm(), { wrapper });

    act(() => result.current.openEditForm(makeAccount()));
    expect(result.current.editingAccountId).toBe("acc-1");
    expect(result.current.editName).toBe("Checking");
    expect(result.current.editIdentifier).toBe("1234");
    expect(result.current.editInitialBalance).toBe("500");

    act(() => result.current.closeEditForm());
    expect(result.current.editingAccountId).toBeNull();
    expect(result.current.editName).toBe("");
  });

  it("defaults editIdentifier to '' when the account has none", () => {
    const { result } = renderHook(() => useAccountEditForm(), { wrapper });
    act(() => result.current.openEditForm(makeAccount({ identifier: null })));
    expect(result.current.editIdentifier).toBe("");
  });

  it("submitEdit updates the account and closes the form", async () => {
    let updatedBody: unknown;
    server.use(
      http.put(`${API_URL}/accounts/acc-1`, async ({ request }) => {
        updatedBody = await request.json();
        return HttpResponse.json({ account: makeAccount({ name: "New name" }) });
      })
    );
    const { result } = renderHook(() => useAccountEditForm(), { wrapper });

    act(() => result.current.openEditForm(makeAccount()));
    act(() => result.current.setEditName("New name"));

    await act(async () => {
      await result.current.submitEdit({ preventDefault: () => {} } as React.FormEvent);
    });

    expect(updatedBody).toMatchObject({ name: "New name" });
    expect(result.current.editingAccountId).toBeNull();
  });

  it("submitEdit is a no-op when nothing is being edited", async () => {
    let called = false;
    server.use(
      http.put(`${API_URL}/accounts/acc-1`, () => {
        called = true;
        return HttpResponse.json({ account: makeAccount() });
      })
    );
    const { result } = renderHook(() => useAccountEditForm(), { wrapper });

    await act(async () => {
      await result.current.submitEdit({ preventDefault: () => {} } as React.FormEvent);
    });

    expect(called).toBe(false);
  });

  it("archiveAccount and restoreAccount both succeed", async () => {
    server.use(
      http.post(`${API_URL}/accounts/acc-1/archive`, () =>
        HttpResponse.json({ account: makeAccount({ isArchived: true }) })
      ),
      http.post(`${API_URL}/accounts/acc-1/restore`, () =>
        HttpResponse.json({ account: makeAccount({ isArchived: false }) })
      )
    );
    const { result } = renderHook(() => useAccountEditForm(), { wrapper });

    await act(async () => {
      await result.current.archiveAccount.mutateAsync("acc-1");
    });
    expect(result.current.archiveAccount.isSuccess).toBe(true);

    await act(async () => {
      await result.current.restoreAccount.mutateAsync("acc-1");
    });
    expect(result.current.restoreAccount.isSuccess).toBe(true);
  });

  it("confirmDelete deletes only after confirmation", async () => {
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/accounts/acc-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const { result } = renderHook(() => useAccountEditForm(), { wrapper });

    await act(async () => {
      await result.current.confirmDelete(makeAccount());
    });

    expect(deleted).toBe(true);
  });

  it("confirmDelete does not delete when the confirmation is dismissed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/accounts/acc-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const { result } = renderHook(() => useAccountEditForm(), { wrapper });

    await act(async () => {
      await result.current.confirmDelete(makeAccount());
    });

    expect(deleted).toBe(false);
  });
});
