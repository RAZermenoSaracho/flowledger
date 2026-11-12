import { currencyFractionDigits, exceedsCurrencyPrecision } from "@flowledger/shared";
import { multiplyByRate } from "./money";

const isoCurrencies = new Set<string>(Intl.supportedValuesOf("currency"));
const formatterCache = new Map<string, Intl.NumberFormat>();

/** Memoized `Intl.NumberFormat`: ISO codes get currency style at their minor units, any other code a plain number with up to 18 decimals. */
function getFormatter(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}|${compact}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;

  const isIso = isoCurrencies.has(currency.toUpperCase());
  const formatter = new Intl.NumberFormat("en-US", {
    ...(isIso ? { style: "currency", currency } : { minimumFractionDigits: 0 }),
    ...(compact
      ? { notation: "compact", maximumFractionDigits: 1 }
      : isIso
        ? {}
        : { maximumFractionDigits: 18 })
  });
  formatterCache.set(key, formatter);
  return formatter;
}

function format(amount: number | string, currency: string, compact: boolean): string {
  // The Intl typings omit string input, but Intl.NumberFormat v3 formats a decimal string exactly.
  const text = getFormatter(currency, compact).format(amount as unknown as number);
  return isoCurrencies.has(currency.toUpperCase()) ? text : `${text} ${currency}`;
}

/**
 * Formats `amount` as currency. ISO 4217 codes use `Intl` currency style at the currency's minor
 * units (e.g. "$1,234.50", "¥1,500"); any other code (crypto) renders as "`<amount> <code>`" with up to
 * 18 decimals. A decimal string is formatted exactly, never through a JS number.
 */
export function formatMoney(amount: number | string, currency: string): string {
  return format(amount, currency, false);
}

/** Same currency rules as {@link formatMoney}, using compact notation (e.g. "$1.2K") for chart axes. */
export function formatCompactMoney(amount: number | string, currency: string): string {
  return format(amount, currency, true);
}

/** Inline validation message when `value` has more decimals than `currency` allows (ISO minor units, 18 for crypto); `null` when it fits. Never rounds. */
export function amountPrecisionError(value: string, currency: string): string | null {
  const allowed = currencyFractionDigits(currency);
  if (!exceedsCurrencyPrecision(value.trim(), currency)) return null;
  return allowed === 0
    ? `${currency} amounts cannot have decimals`
    : `${currency} allows at most ${allowed} decimal places`;
}

/**
 * Suggested counter-amount for `amount` at `rate`, as a decimal string at `currency`'s precision
 * (at most 8 decimals for crypto, trailing zeros trimmed, truncated); `null` for a non-positive input.
 * An editable prefill the user reviews, never a stored value.
 */
export function suggestAmount(amount: string, rate: number, currency: string): string | null {
  const fractionDigits = currencyFractionDigits(currency);
  const result = multiplyByRate(amount, rate, Math.min(fractionDigits, 8));
  return result !== null && fractionDigits > 2 && result.includes(".")
    ? result.replace(/\.?0+$/, "")
    : result;
}
