import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { AccountHoldings, Holding } from "@flowledger/shared";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { accountHoldingsKey } from "../useAccountHoldings";
import { useRefreshLinkedHoldings } from "../useRefreshLinkedHoldings";

const API = "http://localhost:4000";
const valuation = { currency: "USD", value: "1", status: "complete", missingCount: 0, holdingCount: 1 };
const fresh = { accountId: "a1", holdings: [], valuation } as unknown as AccountHoldings;
const linked = { exchange: "XNGS", manualUnitPrice: null } as Holding;

function setup(saved: Holding[], isLoading = false) {
  let calls = 0;
  server.use(
    http.post(`${API}/accounts/a1/holdings/refresh`, () => {
      calls += 1;
      return HttpResponse.json(fresh);
    })
  );
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook((props: { saved: Holding[] }) => useRefreshLinkedHoldings("a1", props.saved, isLoading), {
    wrapper,
    initialProps: { saved }
  });
  return { client, view, calls: () => calls };
}

describe("useRefreshLinkedHoldings", () => {
  it("refreshes once and writes the response into the holdings cache", async () => {
    const { client, view, calls } = setup([linked]);
    await waitFor(() => expect(client.getQueryData(accountHoldingsKey("a1"))).toEqual(fresh));
    view.rerender({ saved: [{ ...linked }] });
    expect(calls()).toBe(1);
  });

  it("does nothing without a linked holding lacking a manual price, or while loading", async () => {
    const none = setup([{ exchange: "XNGS", manualUnitPrice: "5" } as Holding, { exchange: null } as Holding]);
    const loading = setup([linked], true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(none.calls()).toBe(0);
    expect(loading.calls()).toBe(0);
  });

  it("stays silent when the refresh fails", async () => {
    server.use(http.post(`${API}/accounts/a1/holdings/refresh`, () => new HttpResponse(null, { status: 500 })));
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(() => useRefreshLinkedHoldings("a1", [linked], false), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(client.getQueryData(accountHoldingsKey("a1"))).toBeUndefined();
  });
});
