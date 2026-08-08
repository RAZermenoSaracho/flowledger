/** Rounds a number to 2 decimal places. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
