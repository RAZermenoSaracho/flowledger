import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useFormDraft } from "../../../hooks/useFormDraft";
import * as accountsClient from "../../../services/accounts.client";
import type { Account } from "../../../types/accounts.types";
import type { AccountDraft } from "../types/accounts.types";
import { creditCardBody, creditCardFields } from "../utils/creditCardDraft";
import { validateAccountDraft } from "../utils/accountValidation";

function text(value: string | number | null | undefined) {
  return value == null ? "" : String(value);
}

/**
 * Account adapter over `useFormDraft`. For an existing account, `initial` comes from the account (`null` while it
 * loads) and `save` sends one `PUT /accounts/:id` with the changed fields only (blank identifier becomes `null`; the
 * cycle fields are always sent together). With `newAccount`, the draft starts empty in `newAccount.currency` and `save`
 * sends one `POST /accounts` (card fields only for credit cards), then calls `onCreated`. Both invalidate `accounts`
 * and `transactions`. Stored values are coerced to strings, so a numeric API value never reaches a text input.
 */
export function useAccountForm(
  account: Account | null,
  newAccount?: { currency: string; onCreated: (account: Account) => void }
) {
  const queryClient = useQueryClient();
  const newCurrency = newAccount?.currency;

  const initial = useMemo<AccountDraft | null>(() => {
    if (newCurrency) {
      return {
        name: "",
        type: "checking",
        identifier: "",
        currency: newCurrency,
        initialBalance: "0",
        creditLimit: "",
        statementClosingDay: "",
        paymentDueRule: "",
        paymentDueValue: "",
        billingTimeZone: "",
        annualInterestRate: ""
      };
    }
    return (
      account && {
        name: account.name,
        type: account.type,
        identifier: account.identifier ?? "",
        currency: account.currency,
        initialBalance: text(account.initialBalance) || "0",
        creditLimit: text(account.creditLimit),
        statementClosingDay: text(account.statementClosingDay),
        paymentDueRule: account.paymentDueRule ?? "",
        paymentDueValue: text(account.paymentDueValue),
        billingTimeZone: account.billingTimeZone ?? "",
        annualInterestRate: text(account.annualInterestRate)
      }
    );
  }, [account, newCurrency]);

  return useFormDraft<AccountDraft>({
    initial,
    validate: validateAccountDraft,
    save: async (values, changedKeys) => {
      if (newAccount) {
        const { account: created } = await accountsClient.createAccount({
          name: values.name.trim(),
          type: values.type,
          identifier: values.identifier.trim() || null,
          currency: values.currency,
          initialBalance: values.initialBalance.trim() || "0",
          ...(values.type === "credit_card" ? creditCardFields(values) : {})
        });
        await queryClient.invalidateQueries({ queryKey: ["accounts"] });
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        newAccount.onCreated(created);
        return;
      }
      if (!account) return;
      const body: Parameters<typeof accountsClient.updateAccount>[1] = {};
      for (const key of changedKeys) {
        if (key === "identifier")
          body.identifier = values.identifier.trim() || null;
        else if (key === "initialBalance")
          body.initialBalance = values.initialBalance;
        else if (key === "name") body.name = values.name.trim();
        else if (key === "type") body.type = values.type;
        else if (key === "currency") body.currency = values.currency;
      }
      if (values.type === "credit_card") {
        Object.assign(body, creditCardBody(values, changedKeys));
      }
      await accountsClient.updateAccount(account.id, body);
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });
}
