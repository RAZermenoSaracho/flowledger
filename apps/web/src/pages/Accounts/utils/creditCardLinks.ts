import type { BillingPeriod } from "@flowledger/shared";
import { routes } from "../../../constants/routes";

/** Account view URL opened on its Credit card tab. */
export function creditCardTabPath(accountId: string): string {
  return `${routes.account(accountId)}?tab=credit-card`;
}

/**
 * Account view URL on its Transactions tab, narrowed to a billing period: `periodFrom`/`periodTo` are the
 * local `YYYY-MM-DD` labels, `periodStartAt`/`periodEndAt` the API's half-open boundary instants in the
 * card's billing time zone, so the filter never depends on the device zone.
 */
export function periodTransactionsPath(
  accountId: string,
  period: Pick<BillingPeriod, "start" | "end" | "startAt" | "endAt">
): string {
  const params = new URLSearchParams({
    tab: "transactions",
    periodFrom: period.start,
    periodTo: period.end,
    periodStartAt: period.startAt,
    periodEndAt: period.endAt
  });
  return `${routes.account(accountId)}?${params.toString()}`;
}

/** New-transaction draft path with the given prefill params. */
function newTransactionPath(params: Record<string, string>): string {
  return `${routes.transactions}/new?${new URLSearchParams(params).toString()}`;
}

/** Transfer draft into the card for `amount` (the current remaining), in the card's `currency`; the user picks the source account. */
export function payCardPath(accountId: string, amount: string, currency: string): string {
  return newTransactionPath({ type: "transfer", amount, currency, transferToAccountId: accountId });
}

/** Income draft on the card classified as a payment made outside FlowLedger accounts. */
export function externalPaymentPath(accountId: string): string {
  return newTransactionPath({ type: "income", accountId, creditCardKind: "payment" });
}

/** Expense draft on the card classified as an interest charge. */
export function interestChargePath(accountId: string): string {
  return newTransactionPath({ type: "expense", accountId, creditCardKind: "interest" });
}
