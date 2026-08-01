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
