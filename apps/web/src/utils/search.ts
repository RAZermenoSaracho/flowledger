export type SortDirection = "asc" | "desc";

type SortValue = string | number | null | undefined;

type CollectionControls<T> = {
  search?: string;
  searchFields?: (item: T) => SortValue[];
  filters?: ((item: T) => boolean)[];
  sortBy?: string;
  sortDirection?: SortDirection;
  sorters?: Record<string, (item: T) => SortValue>;
};

export function matchesSearch(values: SortValue[], search: string | undefined) {
  const query = search?.trim().toLowerCase();
  if (!query) return true;

  return values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(query)
  );
}

export function applyCollectionControls<T>(
  items: T[],
  {
    search,
    searchFields,
    filters = [],
    sortBy,
    sortDirection = "asc",
    sorters = {}
  }: CollectionControls<T>
) {
  const direction = sortDirection === "asc" ? 1 : -1;
  const sorter = sortBy ? sorters[sortBy] : undefined;

  return [...items]
    .filter((item) =>
      searchFields ? matchesSearch(searchFields(item), search) : true
    )
    .filter((item) => filters.every((filter) => filter(item)))
    .sort((left, right) => {
      if (!sorter) return 0;

      const leftValue = sorter(left);
      const rightValue = sorter(right);

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * direction;
      }

      return (
        String(leftValue ?? "").localeCompare(String(rightValue ?? "")) *
        direction
      );
    });
}

export function dateSortValue(value: string | null | undefined) {
  return value ? Date.parse(value) : 0;
}
