import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { useAccountHoldings } from "../useAccountHoldings";

const API = "http://localhost:4000";
const payload = {
  accountId: "a1",
  holdings: [],
  valuation: {
    currency: "USD",
    value: "0",
    status: "complete",
    missingCount: 0,
    netDeposited: "0"
  }
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const spy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { spy, wrapper };
}

describe("useAccountHoldings", () => {
  it("loads the holdings only while enabled", async () => {
    server.use(http.get(`${API}/accounts/a1/holdings`, () => HttpResponse.json(payload)));
    const { wrapper } = setup();
    const idle = renderHook(() => useAccountHoldings("a1", false), { wrapper });
    expect(idle.result.current.query.fetchStatus).toBe("idle");
    const { result } = renderHook(() => useAccountHoldings("a1", true), { wrapper });
    await waitFor(() => expect(result.current.query.data?.accountId).toBe("a1"));
  });

  it("patches one change set, then invalidates accounts, holdings and the overview", async () => {
    let body: unknown;
    server.use(
      http.get(`${API}/accounts/a1/holdings`, () => HttpResponse.json(payload)),
      http.patch(`${API}/accounts/a1/holdings`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(payload);
      })
    );
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useAccountHoldings("a1", true), { wrapper });
    await result.current.save({ upsert: [{ id: "h1", quantity: "2" }], remove: ["h2"] });
    expect(body).toEqual({ upsert: [{ id: "h1", quantity: "2" }], remove: ["h2"] });
    const keys = spy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["accounts"]);
    expect(keys).toContainEqual(["account-holdings", "a1"]);
    expect(keys).toContainEqual(["financial-overview"]);
  });

  it("rejects when the API refuses the change set", async () => {
    server.use(
      http.get(`${API}/accounts/a1/holdings`, () => HttpResponse.json(payload)),
      http.patch(`${API}/accounts/a1/holdings`, () =>
        HttpResponse.json({ error: "Nope" }, { status: 400 })
      )
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useAccountHoldings("a1", true), { wrapper });
    await expect(result.current.save({ upsert: [], remove: ["x"] })).rejects.toThrow();
  });
});
