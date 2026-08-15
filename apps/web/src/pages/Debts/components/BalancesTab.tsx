import { Link } from "react-router-dom";
import { Card } from "../../../components/Card";
import { RecordCard } from "../../../components/RecordCard";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";
import { routes } from "../../../constants/routes";
import type { PersonBalance } from "../../../types/debts.types";
import { formatMoney } from "../../../utils/currency";
import { displayPerson } from "../utils/debtDisplay";
import {
  BALANCE_DEFAULT_SEARCH_FIELD,
  balanceSearchFields
} from "../utils/debtSearchFields";
import { EmptyState } from "./EmptyState";

/** Tab listing net balances per person as cards; clicking a card opens that person's independent detail page. */
export function BalancesTab({
  balances,
  visibleBalances,
  onBalanceQueryChange,
  summaryCurrency
}: {
  balances: PersonBalance[];
  visibleBalances: PersonBalance[];
  onBalanceQueryChange: (query: SearchBarQuery) => void;
  summaryCurrency: string;
}) {
  return (
    <Card className="min-w-0">
      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Outstanding balances</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            One net balance per person across all unsettled debts, converted
            to {summaryCurrency}. Individual debts stay denominated in their
            original currency.
          </p>
        </div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {visibleBalances.length} of {balances.length}
        </p>
      </div>
      <div className="mt-4">
        <SearchBar
          fields={balanceSearchFields}
          defaultSearchField={BALANCE_DEFAULT_SEARCH_FIELD}
          placeholder="Search people or debts"
          onQueryChange={onBalanceQueryChange}
        />
      </div>
      <div className="mt-4 grid min-w-0 gap-3">
        {balances.length === 0 ? (
          <EmptyState>No outstanding balances.</EmptyState>
        ) : visibleBalances.length === 0 ? (
          <EmptyState>No balances match your search.</EmptyState>
        ) : (
          visibleBalances.map((balance) => {
            const recordCount = balance.theyOweMe.length + balance.iOweThem.length;
            return (
              <Link
                key={balance.key}
                to={`${routes.debts}/balances/${encodeURIComponent(balance.key)}`}
                className="block min-w-0"
              >
                <RecordCard
                  className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800"
                  title={
                    <p className="truncate font-semibold">
                      {displayPerson(balance)}
                    </p>
                  }
                  subtitle={
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {balance.person?.email ? `${balance.person.email} · ` : ""}
                      They owe {formatMoney(balance.theyOweMeTotal, summaryCurrency)}{" "}
                      · You owe{" "}
                      {formatMoney(balance.iOweThemTotal, summaryCurrency)}
                    </p>
                  }
                  trailing={
                    <div className="text-right">
                      <p
                        className={`font-semibold ${
                          balance.netBalance >= 0
                            ? "text-pine dark:text-emerald-400"
                            : "text-coral dark:text-red-400"
                        }`}
                      >
                        {formatMoney(balance.netBalance, summaryCurrency)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {recordCount} record{recordCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  }
                />
              </Link>
            );
          })
        )}
      </div>
    </Card>
  );
}
