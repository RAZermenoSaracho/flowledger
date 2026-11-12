import { useState } from "react";
import type { OffsetPagination } from "../types/common.types";

/**
 * Owns the page and page size of a server-paginated list. The page resets to 1 whenever `resetKey`
 * (the serialized where/sort) changes. Callers report the latest server page count by calling
 * `syncPageCount(count)` during render (a no-op while unchanged or `null`/`undefined`); `page` is
 * clamped to it here, the only place that clamp lives (e.g. after deleting the last row of the last page).
 * A page count of 0 (empty result) does not clamp.
 */
export function usePagination({ resetKey, pageSize: initialPageSize }: { resetKey: string; pageSize: number }) {
  const [state, setState] = useState({ key: resetKey, page: 1 });
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const requested = state.key === resetKey ? state.page : 1;
  const page = pageCount ? Math.min(requested, pageCount) : requested;

  const setPage = (next: number) => setState({ key: resetKey, page: Math.max(1, next) });
  const setPageSize = (next: number) => {
    setPageSizeState(next);
    setPage(1);
  };
  const syncPageCount = (next: number | null | undefined) => {
    if (next != null && next !== pageCount) setPageCount(next);
  };

  const pagination: OffsetPagination = { kind: "offset", page, pageSize };
  return {
    page,
    pageSize,
    pageCount,
    hasNext: page < (pageCount ?? 0),
    setPage,
    setPageSize,
    syncPageCount,
    pagination
  };
}
