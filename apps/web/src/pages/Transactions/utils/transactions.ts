/** Coerces a transaction amount value (number or numeric string) into a safe finite number, defaulting to 0. */
export function parseTransactionAmount(amount: unknown) {
  if (typeof amount === "number") {
    return Number.isFinite(amount) ? amount : 0;
  }

  if (typeof amount === "string") {
    const parsedAmount = Number(amount.trim());
    return Number.isFinite(parsedAmount) ? parsedAmount : 0;
  }

  return 0;
}

/**
 * Today's date in the browser's local timezone, formatted as `YYYY-MM-DD` for an
 * `<input type="date">` value. `Date#toISOString()` converts to UTC first, which rolls
 * over to tomorrow's date for any user west of UTC once local time passes into the
 * evening — this reads the local year/month/day fields directly instead.
 */
export function todayDateString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
