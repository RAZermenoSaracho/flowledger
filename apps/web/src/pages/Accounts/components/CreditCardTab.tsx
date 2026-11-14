import type { CreditCardBilling } from "@flowledger/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { routes } from "../../../constants/routes";
import { Button } from "../../../components/Button";
import { formatMoney } from "../../../utils/currency";
import { formatFilterValue } from "../../../utils/dateTime";
import { isNonZero, isPositive } from "../../../utils/money";
import type { Account } from "../../../types/accounts.types";
import { useCreditCard } from "../hooks/useCreditCard";
import { periodStatusClass, periodStatusLabel } from "../utils/creditCardDisplay";
import {
  creditCardTabPath,
  externalPaymentPath,
  interestChargePath,
  payCardPath
} from "../utils/creditCardLinks";
import { CreditCardPeriodsTable } from "./CreditCardPeriodsTable";

function Metric({ label, tone, children }: { label: string; tone?: "alert" | "warn"; children: ReactNode }) {
  const toneClass =
    tone === "alert"
      ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
      : tone === "warn"
        ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
        : "border-slate-200 dark:border-slate-700";
  return (
    <div className={`min-w-0 rounded-md border p-3 ${toneClass}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <div className="mt-1 break-words text-base font-semibold">{children}</div>
    </div>
  );
}

function EstimateMetric({ billing }: { billing: CreditCardBilling }) {
  const estimate = billing.current?.estimate;
  const currency = billing.metrics.currency;
  return (
    <Metric label="Estimated interest">
      {!estimate || estimate.status === "none" ? (
        "None expected"
      ) : estimate.status === "unavailable" || estimate.amount == null ? (
        <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
          Unavailable — set the annual interest rate
        </span>
      ) : (
        <>
          <span>Estimated {formatMoney(estimate.amount, currency)}</span>
          {estimate.assumptions.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 text-xs font-normal text-slate-500 dark:text-slate-400">
              {estimate.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Metric>
  );
}

/**
 * "Credit card" tab of the account view: live figures, interest estimate next to confirmed
 * interest, the billing-periods table and the Pay / external payment / interest charge actions.
 * All figures come from `GET /accounts/:id/credit-card`; nothing is computed here. Actions link to
 * prefilled transaction drafts and return to this tab.
 */
export function CreditCardTab({ account }: { account: Account }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const query = useCreditCard(account.id, page);
  const billing = query.data;

  if (query.isLoading) {
    return <p role="status" className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>;
  }
  if (query.isError || !billing) {
    return <p role="alert" className="text-sm text-red-600 dark:text-red-400">Could not load credit card data.</p>;
  }

  const { metrics, current, openPeriod } = billing;
  const currency = metrics.currency;
  const from = { from: creditCardTabPath(account.id) };
  const canPay = current != null && isPositive(current.remaining, currency);
  const confirmed = billing.periods.find((period) => period.end === current?.closingDate)?.confirmedInterest;

  return (
    <div className="grid gap-6">
      {!billing.configured ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          Set the statement closing day, payment due rule and time zone on the{" "}
          <Link to={`${routes.account(account.id)}?tab=general`} className="font-semibold underline">
            General tab
          </Link>{" "}
          to see billing periods.
        </p>
      ) : null}

      <section aria-label="Credit card figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Outstanding debt" tone={isNonZero(metrics.debt) ? "warn" : undefined}>
          {formatMoney(metrics.debt, currency)}
        </Metric>
        <Metric label="Credit limit" tone={metrics.overLimit ? "alert" : undefined}>
          {metrics.creditLimit == null ? "No limit" : formatMoney(metrics.creditLimit, currency)}
        </Metric>
        <Metric label="Available credit" tone={metrics.overLimit ? "alert" : undefined}>
          {metrics.availableCredit == null ? "—" : formatMoney(metrics.availableCredit, currency)}
        </Metric>
        <Metric label="Utilization" tone={metrics.overLimit ? "alert" : undefined}>
          {metrics.utilizationPercent == null ? "—" : `${metrics.utilizationPercent}%`}
          {metrics.overLimit ? <span className="block text-xs text-red-600 dark:text-red-400">Over limit</span> : null}
        </Metric>
        {openPeriod ? (
          <>
            <Metric label="Next closing">{formatFilterValue(openPeriod.nextClosingDate)}</Metric>
            <Metric label="Next payment due">{formatFilterValue(openPeriod.nextDueDate)}</Metric>
          </>
        ) : null}
        {current ? (
          <>
            <Metric
              label="Amount to avoid interest"
              tone={current.status === "overdue" ? "alert" : canPay ? "warn" : undefined}
            >
              {formatMoney(current.remaining, currency)}
              <span className={`block text-xs font-normal ${periodStatusClass(current.status)}`}>
                {periodStatusLabel(current.status)} · due {formatFilterValue(current.dueDate)}
              </span>
            </Metric>
            <EstimateMetric billing={billing} />
            <Metric label="Confirmed interest">
              {confirmed == null ? "—" : formatMoney(confirmed, currency)}
            </Metric>
          </>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        {canPay && current ? (
          <Button type="button" onClick={() => navigate(payCardPath(account.id, current.remaining, currency), { state: from })}>
            Pay
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={() => navigate(externalPaymentPath(account.id), { state: from })}>
          Record external payment
        </Button>
        <Button type="button" variant="secondary" onClick={() => navigate(interestChargePath(account.id), { state: from })}>
          Record interest charge
        </Button>
      </div>

      {billing.configured ? (
        <CreditCardPeriodsTable
          accountId={account.id}
          billing={billing}
          isFetching={query.isFetching}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
