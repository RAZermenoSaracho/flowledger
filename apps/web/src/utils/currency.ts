const formatterCache = new Map<string, Intl.NumberFormat | null>();
const compactFormatterCache = new Map<string, Intl.NumberFormat | null>();

function getFormatter(currency: string): Intl.NumberFormat | null {
  const cached = formatterCache.get(currency);
  if (cached !== undefined) return cached;

  let formatter: Intl.NumberFormat | null;
  try {
    formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
  } catch {
    formatter = null;
  }

  formatterCache.set(currency, formatter);
  return formatter;
}

function getCompactFormatter(currency: string): Intl.NumberFormat | null {
  const cached = compactFormatterCache.get(currency);
  if (cached !== undefined) return cached;

  let formatter: Intl.NumberFormat | null;
  try {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1
    });
  } catch {
    formatter = null;
  }

  compactFormatterCache.set(currency, formatter);
  return formatter;
}

// Falls back to "<amount> <code>" for currencies Intl doesn't recognize (e.g. crypto assets).
export function formatMoney(amount: number, currency: string): string {
  const formatter = getFormatter(currency);
  return formatter ? formatter.format(amount) : `${amount.toFixed(2)} ${currency}`;
}

// Same fallback as formatMoney, using compact notation (e.g. "$1.2K") for chart axes.
export function formatCompactMoney(amount: number, currency: string): string {
  const formatter = getCompactFormatter(currency);
  return formatter ? formatter.format(amount) : `${amount.toFixed(2)} ${currency}`;
}
