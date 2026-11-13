import type { Prisma } from "@prisma/client";
import type { TransactionFinancialSnapshot } from "../types/transactions.types.js";

type SnapshotSource = {
  [Key in keyof TransactionFinancialSnapshot]?: unknown;
};

function decimalText(value: unknown) {
  return value == null ? null : (value as Prisma.Decimal).toFixed();
}

function textOrNull(value: unknown) {
  return value == null ? null : String(value);
}

/** Captures a transaction's financial fields for a `TransactionCorrection`: decimals as exact strings, `date` as an ISO instant, absent fields as null. */
export function financialSnapshot(source: SnapshotSource): TransactionFinancialSnapshot {
  return {
    type: textOrNull(source.type),
    amount: decimalText(source.amount),
    executionCurrency: textOrNull(source.executionCurrency),
    accountId: textOrNull(source.accountId),
    transferToAccountId: textOrNull(source.transferToAccountId),
    accountAmount: decimalText(source.accountAmount),
    destinationAmount: decimalText(source.destinationAmount),
    feeAmount: decimalText(source.feeAmount),
    feeCurrency: textOrNull(source.feeCurrency),
    date: source.date instanceof Date ? source.date.toISOString() : textOrNull(source.date)
  };
}

/** True when any financial field differs between two snapshots. */
export function financialFieldsChanged(
  previous: TransactionFinancialSnapshot,
  corrected: TransactionFinancialSnapshot
) {
  return (Object.keys(previous) as (keyof TransactionFinancialSnapshot)[]).some(
    (key) => previous[key] !== corrected[key]
  );
}
