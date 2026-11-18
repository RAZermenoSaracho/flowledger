import { act, renderHook } from "@testing-library/react";
import { HttpResponse, delay, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { useSecuritySearch } from "../useSecuritySearch";

const API = "http://localhost:4000";
const listing = (symbol: string) => ({
  symbol,
  name: symbol,
  exchange: "NASDAQ",
  micCode: "XNGS",
  country: "US",
  currency: "USD",
  type: "stock"
});

function track(respond: (q: string) => Promise<Response> | Response) {
  const queries: string[] = [];
  server.use(
    http.get(`${API}/currencies/securities`, async ({ request }) => {
      const q = new URL(request.url).searchParams.get("q") ?? "";
      queries.push(q);
      return respond(q);
    })
  );
  return queries;
}

describe("useSecuritySearch", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());

  it("makes no request for an empty query", async () => {
    const queries = track(() => HttpResponse.json({ available: true, results: [] }));
    const { result } = renderHook(() => useSecuritySearch("  "));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(result.current.status).toBe("idle");
    expect(queries).toEqual([]);
  });

  it("debounces by 300 ms and returns the results", async () => {
    const queries = track(() => HttpResponse.json({ available: true, results: [listing("AAPL")] }));
    const { result, rerender } = renderHook(({ q }) => useSecuritySearch(q), {
      initialProps: { q: "a" }
    });
    rerender({ q: "aa" });
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(queries).toEqual([]);
    expect(result.current.status).toBe("loading");
    await act(() => vi.advanceTimersByTimeAsync(400));
    await vi.waitFor(() => expect(result.current.status).toBe("ready"));
    expect(queries).toEqual(["aa"]);
    expect(result.current.results[0]?.symbol).toBe("AAPL");
  });

  it("ignores the late response of a superseded query", async () => {
    track(async (q) => {
      if (q === "slow") await delay(1000);
      return HttpResponse.json({ available: true, results: [listing(q.toUpperCase())] });
    });
    const { result, rerender } = renderHook(({ q }) => useSecuritySearch(q), {
      initialProps: { q: "slow" }
    });
    await act(() => vi.advanceTimersByTimeAsync(350));
    rerender({ q: "fast" });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    await vi.waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.results.map((r) => r.symbol)).toEqual(["FAST"]);
  });

  it("reports unavailable when the API says so or the request fails", async () => {
    track(() => HttpResponse.json({ available: false, results: [] }));
    const first = renderHook(() => useSecuritySearch("x"));
    await act(() => vi.advanceTimersByTimeAsync(400));
    await vi.waitFor(() => expect(first.result.current.status).toBe("unavailable"));

    track(() => new HttpResponse(null, { status: 500 }));
    const second = renderHook(() => useSecuritySearch("y"));
    await act(() => vi.advanceTimersByTimeAsync(400));
    await vi.waitFor(() => expect(second.result.current.status).toBe("unavailable"));
  });
});
