import { keepPreviousData, useQuery, type QueryKey } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { MAX_LIST_WINDOW } from "../constants/listWindow";
import type { ListPagerState, RangePagination } from "../types/common.types";

const EMPTY: never[] = [];

/** One fetched window: its rows plus whichever of `total` / `hasNext` the endpoint reports. */
type PageResult<T = unknown> = { items: T[]; total?: number | null; hasNext?: boolean };

function storageName(storageKey: string) {
  return `flowledger:list-limit:${storageKey}`;
}

function readStoredLimit(storageKey: string | undefined, fallback: number) {
  if (!storageKey) return fallback;
  try {
    const stored = Number(window.localStorage.getItem(storageName(storageKey)));
    return Number.isInteger(stored) && stored >= 1 && stored <= MAX_LIST_WINDOW ? stored : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredLimit(storageKey: string | undefined, limit: number) {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(storageName(storageKey), String(limit));
  } catch {
    // Storage can be unavailable (private mode, quota); the window size then just is not remembered.
  }
}

/**
 * Owns the `{offset, limit}` window of a server-paginated list and fetches it with TanStack Query,
 * keeping the previous rows visible while the next window loads.
 *
 * `queryKey` must cover everything that changes the result except the window (the hook appends
 * offset and limit); `resetKey` (the serialized where/sort) returns to offset 0 and keeps `limit`.
 * When the total shrinks so `offset >= total`, the window moves to `max(0, total - limit)`.
 * Only `limit` is remembered, in `localStorage` under `flowledger:list-limit:<storageKey>`;
 * invalid, out-of-bounds or unreadable values fall back to `defaultLimit`. `fetchPage` receives
 * `{kind:"range", offset, limit}`; when it returns no `hasNext`, it is derived from `total`.
 * `refetchIntervalMs` re-fetches the current window on that interval while the hook is mounted.
 * `data` is the raw `fetchPage` result for callers that need extra response fields.
 */
export function usePagination<R extends PageResult>({
  queryKey,
  resetKey,
  fetchPage,
  defaultLimit,
  storageKey,
  refetchIntervalMs
}: {
  queryKey: QueryKey;
  resetKey: string;
  fetchPage: (pagination: RangePagination) => Promise<R>;
  defaultLimit: number;
  storageKey?: string;
  refetchIntervalMs?: number;
}) {
  const [state, setState] = useState(() => ({
    key: resetKey,
    offset: 0,
    limit: readStoredLimit(storageKey, defaultLimit)
  }));
  const { limit } = state;
  const requestedOffset = state.key === resetKey ? state.offset : 0;

  const [lastTotal, setLastTotal] = useState<number | null>(null);
  const offset =
    lastTotal != null && requestedOffset >= lastTotal ? Math.max(0, lastTotal - limit) : requestedOffset;

  const query = useQuery({
    queryKey: [...queryKey, offset, limit],
    placeholderData: keepPreviousData,
    refetchInterval: refetchIntervalMs,
    queryFn: () => fetchPage({ kind: "range", offset, limit })
  });
  const data = query.data;
  const total = data?.total ?? null;
  if (total !== lastTotal && data) setLastTotal(total);

  const items = useMemo<R["items"]>(() => data?.items ?? EMPTY, [data]);
  const hasNext = data?.hasNext ?? (total != null ? offset + limit < total : false);

  const onRangeChange = useCallback(
    (nextOffset: number, nextLimit: number) => {
      setState({ key: resetKey, offset: nextOffset, limit: nextLimit });
      if (nextLimit !== limit) writeStoredLimit(storageKey, nextLimit);
    },
    [resetKey, limit, storageKey]
  );

  const pager: ListPagerState = {
    offset,
    limit,
    total,
    hasNext,
    isFetching: query.isFetching,
    onRangeChange
  };

  return {
    items,
    pager,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? (query.error instanceof Error ? query.error.message : "Could not load records.") : null,
    data
  };
}
