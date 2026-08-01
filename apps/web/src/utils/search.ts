type SearchValue = string | number | null | undefined;

export function matchesSearch(values: SearchValue[], search: string | undefined) {
  const query = search?.trim().toLowerCase();
  if (!query) return true;

  return values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(query)
  );
}
