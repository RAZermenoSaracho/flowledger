import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as accountsClient from "../../../services/accounts.client";
import type { HoldingsChangeSet } from "../../../types/accounts.types";

/** Query key of an account's holdings. */
export const accountHoldingsKey = (accountId: string) =>
  ["account-holdings", accountId] as const;

/**
 * Holdings of one account (`GET /accounts/:id/holdings`, loaded only while `enabled`) plus `save`, which sends one
 * change set and then refreshes the accounts, this account's holdings and the financial overview, since every
 * holdings edit moves the account value and net worth. `save` rejects with the API error so a Form View draft keeps
 * the user's rows.
 */
export function useAccountHoldings(accountId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: accountHoldingsKey(accountId),
    enabled: enabled && Boolean(accountId),
    queryFn: () => accountsClient.getAccountHoldings(accountId)
  });
  const mutation = useMutation({
    mutationFn: (changes: HoldingsChangeSet) =>
      accountsClient.updateAccountHoldings(accountId, changes),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: accountHoldingsKey(accountId) }),
        queryClient.invalidateQueries({ queryKey: ["financial-overview"] })
      ]);
    }
  });
  return { query, save: mutation.mutateAsync };
}
