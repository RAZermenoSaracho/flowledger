import type { Account } from "../../../types/accounts.types";
import type { TransactionDraft } from "../types/transactions.types";

/** The draft fields that only exist because currencies differ; cleared whenever the coupling hides them. */
const CROSS_CURRENCY_KEYS = ["accountAmount", "destinationAmount", "feeAmount", "feeCurrency"] as const;

/** The draft's source account, or `undefined` when none is selected. */
function sourceAccount(draft: TransactionDraft, accounts: Account[]) {
  return accounts.find((account) => account.id === draft.accountId);
}

/** The currency of the source account when it differs from the execution currency, else `null`: the "Amount in account currency" field is then required. */
export function accountAmountCurrency(draft: TransactionDraft, accounts: Account[]): string | null {
  const currency = sourceAccount(draft, accounts)?.currency;
  return currency && currency !== draft.executionCurrency ? currency : null;
}

/** The currency of a transfer's destination account when it differs from the execution currency, else `null`: the "Amount received" field is then required. */
export function destinationAmountCurrency(draft: TransactionDraft, accounts: Account[]): string | null {
  if (draft.type !== "transfer") return null;
  const currency = accounts.find((account) => account.id === draft.transferToAccountId)?.currency;
  return currency && currency !== draft.executionCurrency ? currency : null;
}

/** Currencies a fee may be recorded in: the execution currency, plus the destination currency of a cross-currency transfer. */
export function feeCurrencyOptions(draft: TransactionDraft, accounts: Account[]): string[] {
  const destination = destinationAmountCurrency(draft, accounts);
  return destination ? [draft.executionCurrency, destination] : [draft.executionCurrency];
}

/** Whether the optional fee fields apply: only when an applied amount field is shown, i.e. some currency differs. */
export function feeApplies(draft: TransactionDraft, accounts: Account[]): boolean {
  return accountAmountCurrency(draft, accounts) !== null || destinationAmountCurrency(draft, accounts) !== null;
}

/**
 * Returns the draft with every cross-currency field that no longer applies cleared (applied amounts
 * when currencies match, the fee when none differ, a fee currency outside `feeCurrencyOptions`), so
 * a stale value is never sent. Returns the same object when nothing changes.
 */
export function reconcileCurrencyFields(draft: TransactionDraft, accounts: Account[]): TransactionDraft {
  if (accounts.length === 0) return draft;
  const next = { ...draft };
  if (!accountAmountCurrency(draft, accounts)) next.accountAmount = "";
  if (!destinationAmountCurrency(draft, accounts)) next.destinationAmount = "";
  if (!feeApplies(draft, accounts)) {
    next.feeAmount = "";
    next.feeCurrency = "";
  } else if (next.feeCurrency && !feeCurrencyOptions(draft, accounts).includes(next.feeCurrency)) {
    next.feeCurrency = "";
  }
  return CROSS_CURRENCY_KEYS.every((key) => next[key] === draft[key]) ? draft : next;
}
