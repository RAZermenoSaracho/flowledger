import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePagination } from "../usePagination";

describe("usePagination", () => {
  it("exposes the offset pagination object and moves between pages", () => {
    const { result } = renderHook(() => usePagination({ resetKey: "a", pageSize: 20 }));
    expect(result.current.pagination).toEqual({ kind: "offset", page: 1, pageSize: 20 });
    act(() => result.current.setPage(3));
    expect(result.current.pagination.page).toBe(3);
  });

  it("resets to page 1 when the reset key changes", () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) => usePagination({ resetKey, pageSize: 20 }),
      { initialProps: { resetKey: "a" } }
    );
    act(() => result.current.setPage(4));
    rerender({ resetKey: "b" });
    expect(result.current.page).toBe(1);
  });

  it("resets to page 1 when the page size changes", () => {
    const { result } = renderHook(() => usePagination({ resetKey: "a", pageSize: 25 }));
    act(() => result.current.setPage(2));
    act(() => result.current.setPageSize(100));
    expect(result.current.pagination).toEqual({ kind: "offset", page: 1, pageSize: 100 });
  });

  it("clamps the page to the synced page count and exposes hasNext", () => {
    const { result } = renderHook(() => usePagination({ resetKey: "a", pageSize: 20 }));
    act(() => result.current.setPage(5));
    act(() => result.current.syncPageCount(3));
    expect(result.current.page).toBe(3);
    expect(result.current.pageCount).toBe(3);
    expect(result.current.hasNext).toBe(false);
    act(() => result.current.setPage(1));
    expect(result.current.hasNext).toBe(true);
  });

  it("does not clamp for a page count of zero or an unknown one", () => {
    const { result } = renderHook(() => usePagination({ resetKey: "a", pageSize: 20 }));
    act(() => result.current.setPage(2));
    act(() => result.current.syncPageCount(null));
    expect(result.current.page).toBe(2);
    act(() => result.current.syncPageCount(0));
    expect(result.current.page).toBe(2);
  });
});
