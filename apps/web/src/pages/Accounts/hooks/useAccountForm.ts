import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useFormDraft } from "../../../hooks/useFormDraft";
import * as accountsClient from "../../../services/accounts.client";
import type { Account } from "../../../types/accounts.types";
import type { AccountDraft } from "../types/accounts.types";
import { validateAccountDraft } from "../utils/accountValidation";

/**
 * Account adapter over `useFormDraft`: `initial` comes from the account (`null` while it loads),
 * `save` sends one `PUT /accounts/:id` with the changed fields only (blank identifier becomes
 * `null`) and then invalidates `accounts` and `transactions`.
 */
export function useAccountForm(account: Account | null) {
  const queryClient = useQueryClient();

  const initial = useMemo<AccountDraft | null>(
    () =>
      account && {
        name: account.name,
        type: account.type,
        identifier: account.identifier ?? "",
        currency: account.currency,
        initialBalance: String(account.initialBalance ?? 0)
      },
    [account]
  );

  return useFormDraft<AccountDraft>({
    initial,
    validate: validateAccountDraft,
    save: async (values, changedKeys) => {
      if (!account) return;
      const body: Parameters<typeof accountsClient.updateAccount>[1] = {};
      for (const key of changedKeys) {
        if (key === "identifier")
          body.identifier = values.identifier.trim() || null;
        else if (key === "initialBalance")
          body.initialBalance = Number(values.initialBalance);
        else if (key === "name") body.name = values.name.trim();
        else if (key === "type") body.type = values.type;
        else body.currency = values.currency;
      }
      await accountsClient.updateAccount(account.id, body);
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });
}
