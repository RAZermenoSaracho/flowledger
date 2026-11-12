import { Link } from "react-router-dom";
import { routes } from "../../../constants/routes";
import type { Account } from "../../../types/accounts.types";
import { formatMoney } from "../../../utils/currency";
import { getAccountTypeLabel } from "../utils/accountDisplay";

/** One row in the accounts list: a summary that links to the account's own view. */
export function AccountListItem({
  account,
  preferredCurrency
}: {
  account: Account;
  preferredCurrency: string | null | undefined;
}) {
  return (
    <Link
      to={routes.account(account.id)}
      className="grid gap-3 rounded-md border border-slate-200 p-3 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{account.name}</p>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {account.source === "synced" ? "Synced" : "Manual"}
        </span>
        {account.isArchived ? (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Archived
          </span>
        ) : null}
      </div>
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {getAccountTypeLabel(account.type)} · {account.currency}
        </p>
        <p
          className={`text-sm font-semibold ${
            (account.currentBalance ?? 0) >= 0
              ? "text-pine dark:text-emerald-300"
              : "text-coral dark:text-orange-300"
          }`}
        >
          FlowLedger balance{" "}
          {formatMoney(account.currentBalance ?? 0, account.currency)}
        </p>
        {preferredCurrency &&
        preferredCurrency !== account.currency &&
        account.currentBalanceInPreferredCurrency !== undefined ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {formatMoney(
              account.currentBalanceInPreferredCurrency,
              preferredCurrency
            )}
          </p>
        ) : null}
        {account.identifier ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {account.identifier}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
