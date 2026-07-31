const formatterCache = new Map<string, Intl.NumberFormat | null>();

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

// Falls back to "<amount> <code>" for currencies Intl doesn't recognize (e.g. crypto assets).
export function formatMoney(amount: number, currency: string): string {
  const formatter = getFormatter(currency);
  return formatter ? formatter.format(amount) : `${amount.toFixed(2)} ${currency}`;
}
