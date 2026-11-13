import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../tests/mocks/server";
import { useRateSuggestion } from "../useRateSuggestion";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mockRate(rate: number) {
  server.use(http.get("http://localhost:4000/currencies/rate", () => HttpResponse.json({ from: "USD", to: "MXN", rate })));
}

const base = { enabled: true, from: "USD", to: "MXN", amount: "100", current: "" };

describe("useRateSuggestion", () => {
  it("suggests the converted amount into an empty field", async () => {
    mockRate(17.5);
    const onSuggest = vi.fn();
    renderHook(() => useRateSuggestion({ ...base, onSuggest }), { wrapper });
    await waitFor(() => expect(onSuggest).toHaveBeenCalledWith("1750.00"));
  });

  it("never overwrites a value the user already entered", async () => {
    mockRate(17.5);
    const onSuggest = vi.fn();
    const { result } = renderHook(() => useRateSuggestion({ ...base, current: "1690", onSuggest }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(onSuggest).not.toHaveBeenCalled();
  });

  it("does not fetch or suggest when disabled", async () => {
    const onSuggest = vi.fn();
    const { result } = renderHook(() => useRateSuggestion({ ...base, enabled: false, onSuggest }), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(onSuggest).not.toHaveBeenCalled();
  });
});
