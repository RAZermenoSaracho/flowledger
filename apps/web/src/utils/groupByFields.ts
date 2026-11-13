/** Groups a filtered list by the active group-by ids (in selection order), returning ordered sections with header labels. Returns `undefined` when no group-bys are active (pass straight to ListView `groups`); a single flat section when `items` is empty. */
export function groupByFields<T>(
  items: T[],
  groupBy: string[] | undefined,
  keyOf: (item: T, groupById: string) => { key: string; label: string }
): { key: string; label: string; items: T[] }[] | undefined {
  if (!groupBy?.length) return undefined;
  if (items.length === 0) return [{ key: "", label: "", items }];

  const buckets = new Map<string, { label: string; items: T[] }>();
  for (const item of items) {
    const parts = groupBy.map((id) => keyOf(item, id));
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
