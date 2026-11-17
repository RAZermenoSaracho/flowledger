import type { HoldingsValuation } from "@flowledger/shared";
import { formatMoney } from "../../../utils/currency";

/**
 * Account header figure for an investment or crypto account: the one "Total value" (the sum of its holdings in the
 * account currency) with a subtle note when it is partial (some holdings have no value yet) or empty (no holdings).
 */
export function HoldingsValueSummary({
  valuation
}: {
  valuation: HoldingsValuation;
}) {
  return (
    <dl className="text-sm">
      <dt className="text-slate-500 dark:text-slate-400">Total value</dt>
      <dd className="font-semibold">
        {formatMoney(valuation.value, valuation.currency)}
      </dd>
      {valuation.status === "partial" ? (
        <dd className="text-xs text-slate-500 dark:text-slate-400">
          Partial &mdash; {valuation.missingCount}{" "}
          {valuation.missingCount === 1 ? "holding" : "holdings"} without a
          value
        </dd>
      ) : null}
      {valuation.status === "empty" ? (
        <dd className="text-xs text-slate-500 dark:text-slate-400">
          No holdings yet
        </dd>
      ) : null}
    </dl>
  );
}
