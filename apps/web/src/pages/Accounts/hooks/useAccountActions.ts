import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as accountsClient from "../../../services/accounts.client";

/** Immediate archive, restore and delete mutations for one account, each invalidating the affected queries. */
export function useAccountActions(accountId: string) {
  const queryClient = useQueryClient();

  const archiveAccount = useMutation({
    mutationFn: () => accountsClient.archiveAccount(accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] })
  });

  const restoreAccount = useMutation({
    mutationFn: () => accountsClient.restoreAccount(accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] })
  });

  const deleteAccount = useMutation({
    mutationFn: () => accountsClient.deleteAccount(accountId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  return { archiveAccount, restoreAccount, deleteAccount };
}
