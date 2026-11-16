import type { HoldingsValuation } from "@flowledger/shared";
import { formatMoney } from "../../../utils/currency";

/**
 * Account header figures for an account with holdings: the API's aggregate holdings value (labeled "Partial" when a
 * holding has no value, so the figure is a known subtotal) next to "Net deposited", the transaction-derived balance
 * that never enters the value.
 */
export function HoldingsValueSummary({
  valuation
}: {
  valuation: HoldingsValuation;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:flex">
      <div>
        <dt className="text-slate-500 dark:text-slate-400">
          Holdings value
          {valuation.status === "partial" ? (
            <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold dark:bg-slate-800">
              Partial
            </span>
          ) : null}
        </dt>
        <dd className="font-semibold">
          {formatMoney(valuation.value, valuation.currency)}
        </dd>
      </div>
      <div>
        <dt className="text-slate-500 dark:text-slate-400">Net deposited</dt>
        <dd className="font-semibold">
          {formatMoney(valuation.netDeposited, valuation.currency)}
        </dd>
      </div>
    </dl>
  );
}
