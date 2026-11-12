import type { FinancialOverview, FinancialOverviewDisclosure } from "@flowledger/shared";
import { formatMoney } from "../../../utils/currency";
import { useFinancialOverview } from "../hooks/useFinancialOverview";

const DISCLOSURE_TEXT: Record<FinancialOverviewDisclosure, string> = {
  archived_balance_excluded: "An archived account with a balance is excluded from net worth.",
  rates_missing: "Some items have no exchange rate and are excluded.",
  past_month_current_rates: "Last month's amounts in other currencies are converted at current rates.",
  investment_recorded_balance: "Investment accounts count at recorded balance, not market value.",
  synced_balances: "Synced account balances come from recorded transactions and may differ from the bank."
};

function monthName(month: string) {
  const [year, number] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function NetWorth({ data }: { data: FinancialOverview }) {
  const { netWorth, currency } = data;
  if (netWorth.status === "error") {
    return <p className="text-sm text-red-600 dark:text-red-400">Net worth could not be calculated.</p>;
  }
  const money = (value: number) => formatMoney(value, currency);

  return (
    <div>
      <p className="text-2xl font-semibold">{money(netWorth.total)}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Estimate based on recorded balances, in {currency}
      </p>
      <p className="mt-2 text-sm">
        Accounts {money(netWorth.accounts)} · Owed to me {money(netWorth.owedToMe)} · I owe{" "}
        {money(netWorth.iOwe)}
      </p>
      {netWorth.partial ? (
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
          Partial: excluded for a missing exchange rate: {netWorth.excluded.join(", ")}
        </p>
      ) : null}
      {netWorth.awaitingAcceptance > 0 ? (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {netWorth.awaitingAcceptance} awaiting acceptance (not counted)
        </p>
      ) : null}
    </div>
  );
}

function SavingsRate({ rate }: { rate: FinancialOverview["savingsRate"] }) {
  if (rate.status === "error") {
    return <p className="text-sm text-red-600 dark:text-red-400">Savings rate could not be calculated.</p>;
  }
  const period = monthName(rate.month);
  if (rate.status === "ok") {
    return (
      <div>
        <p className="text-2xl font-semibold">{rate.rate}%</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {period}, based on recorded transactions. A card payment recorded as an expense counts twice.
        </p>
      </div>
    );
  }
  const message = {
    no_data: "Not enough data",
    unavailable_income: "Unavailable: no net income",
    unavailable_rate: "Unavailable: a needed exchange rate is missing"
  }[rate.status];
  return (
    <div>
      <p className="text-lg font-semibold">{message}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">{period}, based on recorded transactions</p>
    </div>
  );
}

/** Read-only Financial overview for the Profile General tab; loads and fails independently of the profile form. */
export function FinancialOverviewSection() {
  const query = useFinancialOverview();

  return (
    <section className="mt-6 min-w-0 [overflow-wrap:anywhere]" aria-labelledby="financial-overview-title">
      <h3 id="financial-overview-title" className="text-lg font-semibold">
        Financial overview
      </h3>
      {query.isPending ? <p className="mt-2 text-sm">Loading...</p> : null}
      {query.isError ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          Financial overview could not be loaded.
        </p>
      ) : null}
      {query.data ? (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <NetWorth data={query.data} />
          <SavingsRate rate={query.data.savingsRate} />
          {query.data.disclosures.length ? (
            <ul className="list-disc pl-5 text-sm text-slate-500 sm:col-span-2 dark:text-slate-400">
              {query.data.disclosures.map((code) => (
                <li key={code}>{DISCLOSURE_TEXT[code]}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
