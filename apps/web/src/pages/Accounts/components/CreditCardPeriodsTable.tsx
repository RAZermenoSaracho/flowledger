import type { BillingPeriod, CreditCardBilling } from "@flowledger/shared";
import { Link } from "react-router-dom";
import { ListViewPagination } from "../../../components/ListView";
import { RelatedList } from "../../../components/RelatedList";
import { formatMoney } from "../../../utils/currency";
import { formatFilterValue } from "../../../utils/dateTime";
import { isNonZero } from "../../../utils/money";
import { BillingPeriodDateCell } from "./BillingPeriodDateCell";
import { BillingPeriodDatesEditor } from "./BillingPeriodDatesEditor";
import { periodStatusClass, periodStatusLabel } from "../utils/creditCardDisplay";
import { periodTransactionsPath } from "../utils/creditCardLinks";

/**
 * Billing-periods table of a credit card (newest first, one API page at a time), with stacked
 * records on mobile. Every figure is shown as returned by the API. Selecting a period opens the
 * account's Transactions tab filtered to its dates. Period end and Payment due can be adjusted per period (marked "Adjusted" with the default shown) and reset to the card's default. An overdue period other than the latest closed one is labeled as carried.
 */
export function CreditCardPeriodsTable({
  accountId,
  billing,
  isFetching,
  onPageChange
}: {
  accountId: string;
  billing: CreditCardBilling;
  isFetching: boolean;
  onPageChange: (page: number) => void;
}) {
  const currency = billing.metrics.currency;
  const money = (value: string | null) => (value == null ? "—" : formatMoney(value, currency));
  const currentClosing = billing.current?.closingDate;
  const offset = (billing.page - 1) * billing.pageSize;

  return (
    <RelatedList<BillingPeriod>
      title="Billing periods"
      rows={billing.periods}
      rowKey={(period) => period.start}
      emptyText="No billing periods yet."
      headerActions={
        <ListViewPagination
          offset={offset}
          limit={billing.pageSize}
          total={billing.totalPeriods}
          hasNext={offset + billing.pageSize < billing.totalPeriods}
          isFetching={isFetching}
          onRangeChange={(nextOffset) => onPageChange(Math.floor(nextOffset / billing.pageSize) + 1)}
        />
      }
      columns={[
        {
          key: "start",
          header: "Period start",
          cell: (period) => (
            <Link
              to={periodTransactionsPath(accountId, period)}
              className="font-medium text-pine underline-offset-2 hover:underline dark:text-emerald-300"
            >
              {formatFilterValue(period.start)}
            </Link>
          )
        },
        {
          key: "end",
          header: "Period end",
          cell: (period) => <BillingPeriodDateCell accountId={accountId} period={period} field="end" />
        },
        {
          key: "due",
          header: "Payment due",
          cell: (period) => <BillingPeriodDateCell accountId={accountId} period={period} field="due" />
        },
        {
          key: "closing",
          header: "Debt at closing",
          align: "right",
          cell: (period) => money(period.closingDebt)
        },
        {
          key: "credits",
          header: "Payments & credits",
          align: "right",
          cell: (period) => <CreditsCell period={period} money={money} />
        },
        {
          key: "remaining",
          header: "Remaining to avoid interest",
          align: "right",
          cell: (period) => money(period.remaining)
        },
        {
          key: "status",
          header: "Status",
          cell: (period) => {
            const carried = period.status === "overdue" && period.end !== currentClosing;
            return (
              <span className={periodStatusClass(period.status, carried)}>
                {periodStatusLabel(period.status, carried)}
                {isNonZero(period.confirmedInterest) ? (
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    Interest charged {money(period.confirmedInterest)}
                  </span>
                ) : null}
              </span>
            );
          }
        },
        {
          key: "dates",
          header: "Adjust dates",
          cell: (period) => <BillingPeriodDatesEditor key={`${period.key}:${period.end}:${period.dueDate}`} accountId={accountId} period={period} />
        }
      ]}
    />
  );
}

function CreditsCell({
  period,
  money
}: {
  period: BillingPeriod;
  money: (value: string | null) => string;
}) {
  const parts: [string, string][] = [
    ["Transfers", period.creditsBreakdown.transfers],
    ["External payments", period.creditsBreakdown.payments],
    ["Refunds", period.creditsBreakdown.refunds],
    ["Cashback", period.creditsBreakdown.cashback],
    ["Other credits", period.creditsBreakdown.other]
  ];
  const shown = parts.filter(([, value]) => isNonZero(value));
  return (
    <details className="sm:text-right">
      <summary className="cursor-pointer">{money(period.credits)}</summary>
      <ul className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {shown.length === 0 ? <li>No credits</li> : null}
        {shown.map(([label, value]) => (
          <li key={label}>
            {label}: {money(value)}
          </li>
        ))}
      </ul>
    </details>
  );
}
