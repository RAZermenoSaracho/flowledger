import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getExchangeRate } from "../services/currencies.client";
import { suggestAmount } from "../utils/currency";

/**
 * Prefills a required counter-amount field with the current-rate conversion of `amount` from
 * `from` to `to`, through `onSuggest`. The first suggestion fills an empty field; later ones only
 * replace the previous suggestion (so a changed amount re-suggests), never a value the user typed
 * or a stored one, and clearing the field to retype does not refill it. `resetKey` (e.g. the chosen
 * account) starts a fresh suggestion when it changes. Disabled when `enabled` is false; nothing is saved, the user reviews and may edit it.
 */
export function useRateSuggestion({
  enabled,
  from,
  to,
  amount,
  current,
  resetKey,
  onSuggest
}: {
  enabled: boolean;
  from: string;
  to: string | null;
  amount: string;
  current: string;
  resetKey?: string;
  onSuggest: (value: string) => void;
}) {
  const lastSuggestion = useRef<string | null>(null);
  const onSuggestRef = useRef(onSuggest);
  onSuggestRef.current = onSuggest;

  const query = useQuery({
    queryKey: ["exchange-rate", from, to],
    queryFn: () => getExchangeRate(from, to!),
    enabled: enabled && Boolean(to) && to !== from,
    staleTime: 60_000
  });

  const rate = query.data?.rate;
  useEffect(() => {
    lastSuggestion.current = null;
  }, [from, to, resetKey]);
  useEffect(() => {
    if (!enabled || !to || rate === undefined) return;
    const suggestion = suggestAmount(amount, rate, to);
    if (suggestion === null || suggestion === current) return;
    const isFirst = lastSuggestion.current === null;
    if (isFirst ? current !== "" : current !== lastSuggestion.current) return;
    lastSuggestion.current = suggestion;
    onSuggestRef.current(suggestion);
  }, [enabled, to, rate, amount, current]);

  return { isLoading: query.isLoading };
}
