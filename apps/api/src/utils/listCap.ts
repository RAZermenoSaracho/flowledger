/**
 * Truncates `rows` to at most `max` entries for bounded API responses.
 * Returns the kept rows as `data` and the untruncated length as `total`.
 */
export function capList<T>(rows: readonly T[], max: number): { data: T[]; total: number } {
  return { data: rows.slice(0, max), total: rows.length };
}
