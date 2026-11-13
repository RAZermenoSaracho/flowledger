import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../tests/mocks/server";
import type { RangePagination } from "../../types/common.types";
import { usePagination } from "../usePagination";

const URL_ = "http://localhost:4000/test-list";
const STORAGE = "flowledger:list-limit:test";

function mockList(total: number | undefined, hasNext?: boolean) {
  const requests: RangePagination[] = [];
  server.use(
    http.get(URL_, ({ request }) => {
      const p = JSON.parse(new URL(request.url).searchParams.get("p")!) as RangePagination;
      requests.push(p);
      return HttpResponse.json({ items: [p.offset], total, hasNext });
    })
  );
  return requests;
}

function render(initial: { resetKey?: string; storageKey?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(
    ({ resetKey }) =>
      usePagination<number>({
        queryKey: ["test-list", resetKey],
        resetKey,
        defaultLimit: 20,
        storageKey: initial.storageKey,
        fetchPage: async (p) => {
          const res = await fetch(`${URL_}?p=${encodeURIComponent(JSON.stringify(p))}`);
          return res.json();
        }
      }),
    { wrapper, initialProps: { resetKey: initial.resetKey ?? "a" } }
  );
}

describe("usePagination", () => {
  beforeEach(() => window.localStorage.clear());

  it("sends a range request and moves with onRangeChange", async () => {
    const requests = mockList(100);
    const { result } = render();
    await waitFor(() => expect(result.current.items).toEqual([0]));
    expect(requests[0]).toEqual({ kind: "range", offset: 0, limit: 20 });
    expect(result.current.pager).toMatchObject({ total: 100, hasNext: true });
    act(() => result.current.pager.onRangeChange(20, 20));
    await waitFor(() => expect(result.current.items).toEqual([20]));
    act(() => result.current.pager.onRangeChange(0, 20));
    await waitFor(() => expect(result.current.pager.offset).toBe(0));
  });

  it("derives hasNext from a total-only response", async () => {
    mockList(30);
    const { result } = render();
    await waitFor(() => expect(result.current.pager.total).toBe(30));
    expect(result.current.pager.hasNext).toBe(true);
    act(() => result.current.pager.onRangeChange(20, 20));
    await waitFor(() => expect(result.current.items).toEqual([20]));
    expect(result.current.pager.hasNext).toBe(false);
  });

  it("returns to offset 0 on reset and keeps the limit", async () => {
    mockList(100);
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.items).toEqual([0]));
    act(() => result.current.pager.onRangeChange(40, 10));
    await waitFor(() => expect(result.current.items).toEqual([40]));
    rerender({ resetKey: "b" });
    expect(result.current.pager).toMatchObject({ offset: 0, limit: 10 });
  });

  it("clamps the offset when the total shrinks", async () => {
    mockList(100);
    const { result } = render();
    await waitFor(() => expect(result.current.items).toEqual([0]));
    act(() => result.current.pager.onRangeChange(80, 20));
    await waitFor(() => expect(result.current.items).toEqual([80]));
    mockList(50);
    act(() => result.current.pager.onRangeChange(60, 20));
    await waitFor(() => expect(result.current.pager.offset).toBe(30));
  });

  it("persists only the limit and restores it", async () => {
    mockList(100);
    const first = render({ storageKey: "test" });
    await waitFor(() => expect(first.result.current.items).toEqual([0]));
    act(() => first.result.current.pager.onRangeChange(40, 100));
    expect(window.localStorage.getItem(STORAGE)).toBe("100");
    const second = render({ storageKey: "test" });
    expect(second.result.current.pager).toMatchObject({ offset: 0, limit: 100 });
  });

  it.each(["0", "9999", "abc", "1.5"])("ignores stored limit %s", (stored) => {
    mockList(100);
    window.localStorage.setItem(STORAGE, stored);
    const { result } = render({ storageKey: "test" });
    expect(result.current.pager.limit).toBe(20);
  });

  it("survives throwing storage", () => {
    mockList(100);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = render({ storageKey: "test" });
    expect(result.current.pager.limit).toBe(20);
    expect(() => act(() => result.current.pager.onRangeChange(0, 30))).not.toThrow();
    vi.restoreAllMocks();
  });
});
