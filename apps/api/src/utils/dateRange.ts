/**
 * Resolves a `dateTo` filter to its exclusive UTC upper bound: a bare `YYYY-MM-DD` covers that
 * whole UTC day, so it becomes the start of the next one; a datetime is used as given.
 */
export function exclusiveDateRangeEnd(dateTo: string): Date {
  const end = new Date(dateTo);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) end.setUTCDate(end.getUTCDate() + 1);
  return end;
}
