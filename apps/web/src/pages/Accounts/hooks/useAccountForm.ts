import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useFormDraft } from "../../../hooks/useFormDraft";
import * as accountsClient from "../../../services/accounts.client";
import type { Holding } from "@flowledger/shared";
import type { Account, HoldingsChangeSet } from "../../../types/accounts.types";
import type { AccountDraft } from "../types/accounts.types";
import { creditCardBody, creditCardFields } from "../utils/creditCardDraft";
import { validateAccountDraft } from "../utils/accountValidation";
import { buildHoldingsChangeSet, holdingsToDrafts } from "../utils/holdingsDraft";

function text(value: string | number | null | undefined) {
  return value == null ? "" : String(value);
}

/** What `useAccountForm` needs to edit an account's holdings in its draft: the saved holdings and a `save` for one change set. */
export type AccountHoldingsBinding = {
  saved: Holding[];
  save: (changes: HoldingsChangeSet) => Promise<unknown>;
};

/**
 * Account adapter over `useFormDraft`. For an existing account, `initial` comes from the account (`null` while it
 * loads) and `save` sends one `PUT /accounts/:id` with the changed fields only (blank identifier becomes `null`; the
 * cycle fields are always sent together). With `newAccount`, the draft starts empty in `newAccount.currency` and `save`
 * sends one `POST /accounts` (card fields only for credit cards), then calls `onCreated`. Both invalidate `accounts`
 * and `transactions`. With `holdings`, the draft also carries the holdings rows; `save` sends the account `PUT` only
 * when an account field changed, then one holdings `PATCH` when the rows changed (a failed `PATCH` rejects, so the draft
 * keeps the rows and the error shows). Stored values are coerced to strings, so a numeric API value never reaches a text input.
 */
export function useAccountForm(
  account: Account | null,
  newAccount?: { currency: string; onCreated: (account: Account) => void },
  holdings?: AccountHoldingsBinding
) {
  const queryClient = useQueryClient();
  const newCurrency = newAccount?.currency;
  const savedHoldings = holdings?.saved;
  const holdingsRows = useMemo(
    () => holdingsToDrafts(savedHoldings ?? []),
    [savedHoldings]
  );

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
        annualInterestRate: "",
        holdings: []
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
        annualInterestRate: text(account.annualInterestRate),
        holdings: holdingsRows
      }
    );
  }, [account, newCurrency, holdingsRows]);

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
      const accountKeys = changedKeys.filter((key) => key !== "holdings");
      if (accountKeys.length > 0) {
        const body: Parameters<typeof accountsClient.updateAccount>[1] = {};
        for (const key of accountKeys) {
          if (key === "identifier")
            body.identifier = values.identifier.trim() || null;
          else if (key === "initialBalance")
            body.initialBalance = values.initialBalance;
          else if (key === "name") body.name = values.name.trim();
          else if (key === "type") body.type = values.type;
          else if (key === "currency") body.currency = values.currency;
        }
        if (values.type === "credit_card") {
          Object.assign(body, creditCardBody(values, accountKeys));
        }
        await accountsClient.updateAccount(account.id, body);
        await queryClient.invalidateQueries({ queryKey: ["accounts"] });
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      }
      if (holdings && changedKeys.includes("holdings")) {
        await holdings.save(
          buildHoldingsChangeSet(values.holdings, holdings.saved)
        );
      }
    }
  });
}
