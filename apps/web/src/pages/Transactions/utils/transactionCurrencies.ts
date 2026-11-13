import type { Account } from "../../../types/accounts.types";
import type { TransactionDraft } from "../types/transactions.types";

/** The draft fields that only exist because currencies differ; cleared whenever the coupling hides them. */
const CROSS_CURRENCY_KEYS = ["accountAmount", "destinationAmount", "feeAmount", "feeCurrency"] as const;

/** The currency of `accountId` when it differs from the execution currency, else `null`: the matching applied-amount field is then required. */
export function differingCurrency(draft: TransactionDraft, accounts: Account[], accountId: string): string | null {
  const currency = accounts.find((account) => account.id === accountId)?.currency;
  return currency && currency !== draft.executionCurrency ? currency : null;
}

/** The id of a transfer's destination account, or `""` for any other type. */
export function destinationAccountId(draft: TransactionDraft): string {
  return draft.type === "transfer" ? draft.transferToAccountId : "";
}

/** Currencies a fee may be recorded in: the execution currency, plus the destination currency of a cross-currency transfer. */
export function feeCurrencyOptions(draft: TransactionDraft, accounts: Account[]): string[] {
  const destination = differingCurrency(draft, accounts, destinationAccountId(draft));
  return destination ? [draft.executionCurrency, destination] : [draft.executionCurrency];
}

/** Whether the optional fee fields apply: only when an applied amount field is shown, i.e. some currency differs. */
export function feeApplies(draft: TransactionDraft, accounts: Account[]): boolean {
  return differingCurrency(draft, accounts, draft.accountId) !== null || differingCurrency(draft, accounts, destinationAccountId(draft)) !== null;
}

/**
 * Returns the draft with every cross-currency field that no longer applies cleared (applied amounts
 * when currencies match, the fee when none differ, a fee currency outside `feeCurrencyOptions`), so
 * a stale value is never sent. Returns the same object when nothing changes.
 */
export function reconcileCurrencyFields(draft: TransactionDraft, accounts: Account[]): TransactionDraft {
  if (accounts.length === 0) return draft;
  const next = { ...draft };
  if (!differingCurrency(draft, accounts, draft.accountId)) next.accountAmount = "";
  if (!differingCurrency(draft, accounts, destinationAccountId(draft))) next.destinationAmount = "";
  if (!feeApplies(draft, accounts)) {
    next.feeAmount = "";
    next.feeCurrency = "";
  } else if (next.feeCurrency && !feeCurrencyOptions(draft, accounts).includes(next.feeCurrency)) {
    next.feeCurrency = "";
  }
  return CROSS_CURRENCY_KEYS.every((key) => next[key] === draft[key]) ? draft : next;
}
