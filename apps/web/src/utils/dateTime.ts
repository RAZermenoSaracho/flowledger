import type { Transaction } from "../types/transactions.types";

const DAY_MS = 86_400_000;

function toInputValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/**
 * Formats a transaction's execution date and time in the device's timezone and locale.
 * The time is omitted for an unedited linked import at exactly UTC noon: Syncfy reports days
 * that way, with no execution time, so any edit that moves `date` shows the time again.
 */
export function formatTransactionDate(
  transaction: Pick<Transaction, "date" | "providerImportedTransaction">
): string {
  const date = new Date(transaction.date);
  const providerDateOnly =
    transaction.providerImportedTransaction?.transactionDate ===
      transaction.date && date.getTime() % DAY_MS === DAY_MS / 2;
  if (providerDateOnly) return date.toLocaleDateString();
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/** A transaction's execution time in the device's timezone, as a `datetime-local` value (`YYYY-MM-DDTHH:mm`). Its first 7 characters are the displayed month. */
export function transactionDateInputValue(
  transaction: Pick<Transaction, "date">
): string {
  return toInputValue(new Date(transaction.date));
}

/** The current time as a `datetime-local` value. */
export function transactionDateNowInputValue(): string {
  return toInputValue(new Date());
}

/**
 * Converts a `datetime-local` value to the UTC instant to send. With an `original`, returns
 * `undefined` when the value matches its prefill, so saving leaves the stored timestamp alone,
 * and otherwise keeps the original's seconds and milliseconds, which the field doesn't show.
 */
export function transactionDateRequestValue(
  inputValue: string,
  original?: Pick<Transaction, "date">
): string | undefined {
  const next = new Date(inputValue);
  if (original) {
    if (inputValue === transactionDateInputValue(original)) return undefined;
    const originalDate = new Date(original.date);
    next.setSeconds(originalDate.getSeconds(), originalDate.getMilliseconds());
  }
  return next.toISOString();
}

/** The UTC instant at which a `YYYY-MM-DD` calendar day, shifted by `addDays`, starts in the device's timezone. Days may be 23 or 25 hours long across DST. */
export function localDayStartInstant(day: string, addDays = 0): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date! + addDays).toISOString();
}

/**
 * Converts a date filter value in the device's timezone to a UTC instant for a half-open range.
 * A `lower` bound is the start of its day (`YYYY-MM-DD`) or minute (`YYYY-MM-DDTHH:mm`); an `upper`
 * bound is the start of the following day or minute, to be used as an exclusive `<`.
 */
export function filterBoundInstant(
  value: string,
  bound: "lower" | "upper"
): string {
  const upper = bound === "upper";
  if (!value.includes("T")) return localDayStartInstant(value, upper ? 1 : 0);
  return new Date(
    new Date(value).getTime() + (upper ? 60_000 : 0)
  ).toISOString();
}

/** Formats a date filter value (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`) in the device's locale, with the time only when present. */
export function formatFilterValue(value: string): string {
  if (!value.includes("T"))
    return new Date(`${value}T00:00`).toLocaleDateString();
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
