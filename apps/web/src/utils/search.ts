type SearchValue = string | number | null | undefined;

/** Whether any of `values` contains `search` as a case-insensitive substring (empty/undefined `search` always matches). */
export function matchesSearch(values: SearchValue[], search: string | undefined) {
  const query = search?.trim().toLowerCase();
  if (!query) return true;

  return values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(query)
  );
}
