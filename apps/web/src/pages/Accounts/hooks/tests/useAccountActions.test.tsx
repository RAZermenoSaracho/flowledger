import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { useAccountActions } from "../useAccountActions";

const API_URL = "http://localhost:4000";

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    invalidate,
    ...renderHook(() => useAccountActions("acc-1"), { wrapper })
  };
}

describe("useAccountActions", () => {
  it("archives and invalidates accounts", async () => {
    let hit = false;
    server.use(
      http.post(`${API_URL}/accounts/acc-1/archive`, () => {
        hit = true;
        return HttpResponse.json({ account: {} });
      })
    );
    const { result, invalidate } = setup();
    await act(() => result.current.archiveAccount.mutateAsync());
    expect(hit).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts"] });
  });

  it("restores and invalidates accounts", async () => {
    let hit = false;
    server.use(
      http.post(`${API_URL}/accounts/acc-1/restore`, () => {
        hit = true;
        return HttpResponse.json({ account: {} });
      })
    );
    const { result, invalidate } = setup();
    await act(() => result.current.restoreAccount.mutateAsync());
    expect(hit).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts"] });
  });

  it("deletes and invalidates accounts and transactions", async () => {
    let hit = false;
    server.use(
      http.delete(`${API_URL}/accounts/acc-1`, () => {
        hit = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const { result, invalidate } = setup();
    await act(() => result.current.deleteAccount.mutateAsync());
    await waitFor(() => expect(hit).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transactions"] });
  });
});
