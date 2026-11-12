import type { Transaction } from "../../../types/transactions.types";
import { formatMoney } from "../../../utils/currency";
import { formatTransactionDate } from "../../../utils/dateTime";
import { crossCurrencyRecord } from "../utils/crossCurrencyRecord";

/**
 * Read-only record of a saved cross-currency transaction: source and applied (or received) amount,
 * execution time, the effective rate and, when a fee is recorded, the fee and the rate before it.
 * Renders nothing for a single-currency transaction. Rates are derived from the stored amounts for display only.
 */
export function CrossCurrencyRecord({ transaction }: { transaction: Transaction }) {
  const record = crossCurrencyRecord(transaction);
  if (!record) return null;

  const rows: [string, string][] = [
    ["Source", formatMoney(record.sourceAmount, record.sourceCurrency)],
    [
      transaction.type === "transfer" ? "Received" : "Applied to account",
      formatMoney(record.targetAmount, record.targetCurrency)
    ],
    ["Executed", formatTransactionDate(transaction)],
    [
      "Effective rate",
      `1 ${record.sourceCurrency} = ${record.effectiveRate} ${record.targetCurrency}`
    ]
  ];
  if (record.fee) {
    rows.push(["Fee", formatMoney(record.fee.amount, record.fee.currency)]);
    if (record.rateBeforeFee !== null) {
      rows.push([
        "Rate before fee",
        `1 ${record.sourceCurrency} = ${record.rateBeforeFee} ${record.targetCurrency}`
      ]);
    }
  }

  return (
    <section aria-label="Cross-currency record" className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <h2 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">Cross-currency record</h2>
      <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-4">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
