import { useQueryClient } from "@tanstack/react-query";
import type { AccountHoldings, Holding } from "@flowledger/shared";
import { useEffect, useRef } from "react";
import { refreshHoldings } from "../../../services/accounts.client";
import { accountHoldingsKey } from "./useAccountHoldings";

/**
 * Once per account (per mount), after the stored holdings have loaded, asks the API to refresh provider-linked holdings
 * that have no manual price and writes the response straight into the account's holdings cache, so new quotes appear
 * without a spinner. Skipped when nothing is linked or `isLoading`; failures are silent and the stored values stay.
 * Accounts and the overview are re-fetched only when the account total moved. A draft with unsaved row edits keeps
 * its rows (see `useFormDraft`).
 */
export function useRefreshLinkedHoldings(
  accountId: string,
  saved: Holding[],
  isLoading: boolean
) {
  const queryClient = useQueryClient();
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || refreshedFor.current === accountId) return;
    refreshedFor.current = accountId;
    if (
      !saved.some(
        (holding) => holding.exchange !== null && !holding.manualUnitPrice
      )
    )
      return;
    const key = accountHoldingsKey(accountId);
    refreshHoldings(accountId)
      .then((fresh) => {
        const before = queryClient.getQueryData<AccountHoldings>(key);
        queryClient.setQueryData(key, fresh);
        if (before?.valuation.value !== fresh.valuation.value) {
          void queryClient.invalidateQueries({ queryKey: ["accounts"] });
          void queryClient.invalidateQueries({
            queryKey: ["financial-overview"]
          });
        }
      })
      .catch(() => {});
  }, [accountId, saved, isLoading, queryClient]);
}
