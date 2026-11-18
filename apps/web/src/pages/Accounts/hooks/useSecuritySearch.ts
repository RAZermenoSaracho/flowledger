import { useEffect, useState } from "react";
import { searchSecurities } from "../../../services/currencies.client";
import type { SecuritySearchState } from "../types/accounts.types";

const DEBOUNCE_MS = 300;

/**
 * Debounced securities search for `query` (300 ms, trimmed). An empty query is `idle` and makes no request; a changed
 * query aborts the previous request and its late response is never shown. `loading` covers the debounce and the
 * request; a failed request or an `available: false` response is `unavailable`.
 */
export function useSecuritySearch(query: string): SecuritySearchState {
  const text = query.trim();
  const [settled, setSettled] = useState<
    (SecuritySearchState & { query: string }) | null
  >(null);

  useEffect(() => {
    if (!text) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchSecurities(text, controller.signal)
        .then((response) =>
          setSettled({
            query: text,
            status: response.available ? "ready" : "unavailable",
            results: response.available ? response.results : []
          })
        )
        .catch(() => {
          if (!controller.signal.aborted)
            setSettled({ query: text, status: "unavailable", results: [] });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  if (!text) return { status: "idle", results: [] };
  if (settled?.query !== text) return { status: "loading", results: [] };
  return { status: settled.status, results: settled.results };
}
