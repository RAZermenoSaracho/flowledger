/** A group-by option's id/label. */
export type SearchGroupByDef = {
  id: string;
  label: string;
};

/** Groups a filtered list by the active group-by ids (in selection order), returning ordered sections with header labels. A single flat section is returned when no group-bys are active. */
export function groupByFields<T>(
  items: T[],
  activeGroupByIds: string[],
  groupBys: SearchGroupByDef[],
  keyOf: (item: T, groupById: string) => { key: string; label: string }
): { key: string; label: string; items: T[] }[] {
  if (activeGroupByIds.length === 0 || items.length === 0) {
    return [{ key: "", label: "", items }];
  }

  const buckets = new Map<string, { label: string; items: T[] }>();
  for (const item of items) {
    const parts = activeGroupByIds
      .filter((id) => groupBys.some((groupBy) => groupBy.id === id))
      .map((id) => keyOf(item, id));
    const key = parts.map((part) => part.key).join(" / ");
    const label = parts.map((part) => part.label).join(" / ");
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.items.push(item);
    } else {
      buckets.set(key, { label, items: [item] });
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { label, items: bucketItems }]) => ({
      key,
      label,
      items: bucketItems
    }));
}
