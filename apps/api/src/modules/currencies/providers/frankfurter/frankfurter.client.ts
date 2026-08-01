export async function fetchFrankfurterCurrencies(): Promise<Record<string, string>> {
  const response = await fetch("https://api.frankfurter.app/currencies");
  if (!response.ok) {
    throw new Error(`Frankfurter responded with ${response.status}`);
  }
  return (await response.json()) as Record<string, string>;
}

export async function fetchFrankfurterRate(
  from: string,
  to: string
): Promise<number> {
  const response = await fetch(
    `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
  if (!response.ok) {
    throw new Error(
      `Frankfurter exchange rate lookup failed with ${response.status}`
    );
  }

  const data = (await response.json()) as { rates?: Record<string, number> };
  const rate = data.rates?.[to];
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    throw new Error(`Frankfurter did not return a rate for ${from} -> ${to}`);
  }

  return rate;
}
