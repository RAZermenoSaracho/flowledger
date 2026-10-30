import { capList } from "../../../utils/listCap.js";

/** Maximum rows returned per debts list through the public API surfaces. */
export const DEBT_LIST_CAP = 100;

/**
 * Caps every array section of a `listDebts` result to {@link DEBT_LIST_CAP} rows for the public API.
 * Returns the capped sections plus `totals`, a map from section name to its untruncated length.
 */
export function capDebtLists<T extends Record<string, unknown[]>>(result: T) {
  const capped: Record<string, unknown[]> = {};
  const totals: Record<string, number> = {};
  for (const [section, rows] of Object.entries(result)) {
    const { data, total } = capList(rows, DEBT_LIST_CAP);
    capped[section] = data;
    totals[section] = total;
  }
  return { ...(capped as { [K in keyof T]: T[K] }), totals };
}
