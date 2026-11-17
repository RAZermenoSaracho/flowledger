import type { AccountContributions } from "@flowledger/shared";
import { formatMoney } from "../../../utils/currency";

/**
 * Secondary "Net contributions" line for the Transactions tab of an investment or crypto account: the net of
 * transfers in and out in the account currency, with the in/out split and a note when transfers without a recorded
 * amount were left out. It is not a balance, profit or return.
 */
export function NetContributions({
  contributions
}: {
  contributions: AccountContributions;
}) {
  const { currency, incoming, outgoing, net, excludedCount } = contributions;
  return (
    <div className="mb-3 text-sm text-slate-600 dark:text-slate-300">
      <p>
        <span className="font-medium">Net contributions:</span>{" "}
        {formatMoney(net, currency)}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Transfers in {formatMoney(incoming, currency)} · out{" "}
        {formatMoney(outgoing, currency)}
      </p>
      {excludedCount > 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {excludedCount === 1
            ? "1 transfer without a recorded amount is not included"
            : `${excludedCount} transfers without a recorded amount are not included`}
        </p>
      ) : null}
    </div>
  );
}
