import { currencyFractionDigits } from "@flowledger/shared";

const isoCurrencies = new Set<string>(Intl.supportedValuesOf("currency"));
const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/** Parses a plain decimal string into minor units at `digits`; throws on malformed, negative, or over-precise input. */
export function toUnits(value: string, digits: number): bigint {
  const match = DECIMAL.exec(value.trim());
  if (!match || match[1]) throw new RangeError(`Invalid non-negative decimal: "${value}"`);
  const fraction = match[3] ?? "";
  if (fraction.length > digits) throw new RangeError(`"${value}" exceeds ${digits} decimals`);
  return BigInt(match[2]! + fraction.padEnd(digits, "0"));
}

/**
 * Formats minor units as a canonical decimal string (no exponent). Keeps exactly `digits` decimals
 * unless `trim` is set, which drops trailing zeros (used for crypto).
 */
export function fromUnits(units: bigint, digits: number, trim = false): string {
  const negative = units < 0n;
  const text = (negative ? -units : units).toString().padStart(digits + 1, "0");
  const whole = text.slice(0, text.length - digits);
  let fraction = text.slice(text.length - digits);
  if (trim) fraction = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Whether `currency` is a non-ISO (crypto) code, whose amounts render with trailing zeros trimmed. */
function isTrimmed(currency: string): boolean {
  return !isoCurrencies.has(currency.toUpperCase());
}

/** Parses `value` to `currency` minor units, or `null` when blank, malformed, negative, or too precise. */
export function parseUnits(value: string, currency: string): bigint | null {
  try {
    return toUnits(value, currencyFractionDigits(currency));
  } catch {
    return null;
  }
}

/** Formats `units` of `currency` as its canonical decimal string. */
export function formatUnits(units: bigint, currency: string): string {
  return fromUnits(units, currencyFractionDigits(currency), isTrimmed(currency));
}

/** `a + b` in `currency`; throws on an invalid operand. */
export function add(a: string, b: string, currency: string): string {
  const digits = currencyFractionDigits(currency);
  return formatUnits(toUnits(a, digits) + toUnits(b, digits), currency);
}

/** `a - b` in `currency`; may be negative; throws on an invalid operand. */
export function subtract(a: string, b: string, currency: string): string {
  const digits = currencyFractionDigits(currency);
  return formatUnits(toUnits(a, digits) - toUnits(b, digits), currency);
}

/** Orders `a` and `b` (-1, 0, 1); throws on an invalid operand. */
export function compare(a: string, b: string, currency: string): -1 | 0 | 1 {
  const digits = currencyFractionDigits(currency);
  const diff = toUnits(a, digits) - toUnits(b, digits);
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

/** Sums `values` in `currency`, ignoring blank or invalid entries (draft inputs being typed). */
export function sum(values: string[], currency: string): string {
  const total = values.reduce((acc, value) => acc + (parseUnits(value, currency) ?? 0n), 0n);
  return formatUnits(total, currency);
}

/** Whether a decimal string holds any non-zero digit (a recorded payment); blank or absent is zero. */
export function isNonZero(value: string | undefined): boolean {
  return /[1-9]/.test(value ?? "");
}

/** Whether `value` is a valid amount at `currency` precision and strictly positive. */
export function isPositive(value: string, currency: string): boolean {
  return (parseUnits(value, currency) ?? 0n) > 0n;
}

/**
 * Splits `amount` into `n` shares that sum exactly: the base is `units / n` and the remainder
 * units go +1 each to the first slots (slot 0 is the owner when included, then list order).
 * Returns an empty list for an invalid amount or `n < 1`.
 */
export function allocateEvenly(amount: string, currency: string, n: number): string[] {
  const units = parseUnits(amount, currency);
  if (units === null || n < 1) return [];
  const count = BigInt(n);
  const base = units / count;
  const remainder = Number(units % count);
  return Array.from({ length: n }, (_, i) => formatUnits(i < remainder ? base + 1n : base, currency));
}

/** Shortest round-trip decimal of a finite number, expanded out of exponent form; `""` for NaN/Infinity. */
function numberToDecimal(value: number): string {
  if (!Number.isFinite(value)) return "";
  const text = String(value);
  return /e/i.test(text) ? value.toFixed(20).replace(/\.?0+$/, "") : text;
}

/** Parses a decimal string (or finite number) into an integer and its decimal scale; `null` when malformed or negative. */
function parseScaled(value: string | number): { n: bigint; scale: number } | null {
  const text = typeof value === "number" ? numberToDecimal(value) : value.trim();
  const match = DECIMAL.exec(text);
  if (!match || match[1]) return null;
  const fraction = match[3] ?? "";
  return { n: BigInt(match[2]! + fraction), scale: fraction.length };
}

/** Renders `n / 10^scale` with trailing zeros trimmed. */
function trimmedDecimal(n: bigint, scale: number): string {
  return fromUnits(n, scale, true);
}

/**
 * Display-only exchange rate `target / source` to `significantDigits` significant digits (truncated),
 * via BigInt scaled division. `null` when either amount is invalid or not positive.
 */
export function divideToSignificant(target: string, source: string, significantDigits = 8): string | null {
  const t = parseScaled(target);
  const s = parseScaled(source);
  if (!t || !s || t.n <= 0n || s.n <= 0n) return null;
  // value = (t.n / s.n) * 10^(s.scale - t.scale); scale the numerator so the quotient keeps enough digits.
  const extra = BigInt(significantDigits + s.n.toString().length + 2);
  const quotient = (t.n * 10n ** extra) / s.n;
  const scale = Number(extra) + t.scale - s.scale;
  const digitCount = quotient.toString().length;
  const drop = Math.max(0, digitCount - significantDigits);
  const kept = quotient / 10n ** BigInt(drop);
  const keptScale = scale - drop;
  if (keptScale < 0) return (kept * 10n ** BigInt(-keptScale)).toString();
  return trimmedDecimal(kept, keptScale);
}

/**
 * `amount * rate` truncated to `digits` decimals as a canonical decimal string; `rate` may be a number
 * from the API. `null` when the inputs are invalid or the result is not positive.
 */
export function multiplyByRate(amount: string, rate: string | number, digits: number): string | null {
  const a = parseScaled(amount);
  const r = parseScaled(rate);
  if (!a || !r) return null;
  const product = a.n * r.n;
  const scale = a.scale + r.scale;
  const shifted = scale >= digits ? product / 10n ** BigInt(scale - digits) : product * 10n ** BigInt(digits - scale);
  return shifted > 0n ? fromUnits(shifted, digits) : null;
}
