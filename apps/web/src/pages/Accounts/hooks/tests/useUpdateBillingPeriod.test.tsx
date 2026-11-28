import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { useUpdateBillingPeriod } from "../useUpdateBillingPeriod";

describe("useUpdateBillingPeriod", () => {
  it("patches the period and invalidates the card's billing queries", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    let body: unknown;
    server.use(
      http.patch("http://localhost:4000/accounts/card-1/credit-card/periods/2026-11", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ key: "2026-11" });
      })
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateBillingPeriod("card-1", "2026-11"), { wrapper });

    result.current.mutate({ dueDate: "2026-12-18" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(body).toEqual({ dueDate: "2026-12-18" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts", "credit-card", "card-1"] });
  });

  it("exposes the API error", async () => {
    server.use(
      http.patch("http://localhost:4000/accounts/card-1/credit-card/periods/2026-11", () =>
        HttpResponse.json({ message: "Rejected" }, { status: 400 })
      )
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateBillingPeriod("card-1", "2026-11"), { wrapper });
    result.current.mutate({ closingDate: "2026-11-01" });
    await waitFor(() => expect(result.current.error?.message).toBe("Rejected"));
  });
});
