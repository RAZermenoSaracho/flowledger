import type { UpdateAccountInput } from "@flowledger/shared";
import type { AccountDraft } from "../types/accounts.types";

const CYCLE_KEYS = ["statementClosingDay", "paymentDueRule", "paymentDueValue", "billingTimeZone"];

/** The card fields of `draft` as API values; an empty input becomes `null`. */
export function creditCardFields(draft: AccountDraft) {
  return {
    creditLimit: draft.creditLimit.trim() || null,
    statementClosingDay: draft.statementClosingDay.trim() ? Number(draft.statementClosingDay) : null,
    paymentDueRule: draft.paymentDueRule || null,
    paymentDueValue: draft.paymentDueValue.trim() ? Number(draft.paymentDueValue) : null,
    billingTimeZone: draft.billingTimeZone.trim() || null,
    annualInterestRate: draft.annualInterestRate.trim() || null
  };
}

/** Update body for the changed card fields; touching any billing-cycle field sends all four, since the API requires them together. */
export function creditCardBody(draft: AccountDraft, changedKeys: string[]): Partial<UpdateAccountInput> {
  const fields = creditCardFields(draft);
  const sendCycle = changedKeys.some((key) => CYCLE_KEYS.includes(key));
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (changedKeys.includes(key) || (sendCycle && CYCLE_KEYS.includes(key))) body[key] = value;
  }
  return body;
}

/** Device IANA time zone, used as the billing zone when a cycle is first configured. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
