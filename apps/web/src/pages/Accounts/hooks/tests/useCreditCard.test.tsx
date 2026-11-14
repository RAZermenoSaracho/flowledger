import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { makeBilling } from "../../../../tests/fixtures/creditCardBilling";
import { useCreditCard } from "../useCreditCard";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useCreditCard", () => {
  it("requests the card's billing page", async () => {
    const pages: string[] = [];
    server.use(
      http.get("http://localhost:4000/accounts/card-1/credit-card", ({ request }) => {
        pages.push(new URL(request.url).searchParams.get("page") ?? "");
        return HttpResponse.json(makeBilling());
      })
    );
    const { result } = renderHook(() => useCreditCard("card-1", 2), { wrapper });
    await waitFor(() => expect(result.current.data?.accountId).toBe("card-1"));
    expect(pages).toEqual(["2"]);
  });

  it("stays idle without an account id", () => {
    const { result } = renderHook(() => useCreditCard("", 1), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
