import { apiRequest } from "./api.client";
import type { Category } from "../types/categories.types";
import type { CategoryType } from "@flowledger/shared";

/** Sortable fields for the categories list. */
export type CategorySortBy = "name" | "createdAt" | "updatedAt";
/** Ascending or descending sort direction. */
export type SortDirection = "asc" | "desc";

/** Filter/sort params for listing categories. */
export type ListCategoriesParams = {
  groupId?: string;
  scope?: "all";
  includeArchived?: boolean;
  sortBy?: CategorySortBy;
  sortDirection?: SortDirection;
  types?: CategoryType[];
};

/** Fetches categories, optionally merging personal and group categories via `scope: "all"`. */
export function listCategories(params: ListCategoriesParams = {}) {
  return apiRequest<{ categories: Category[] }>("/categories", {
    query: {
      groupId: params.groupId,
      scope: params.scope,
      includeArchived: params.includeArchived ? "true" : undefined,
      sortBy: params.sortBy,
      sortDirection: params.sortDirection,
      types: params.types
    }
  });
}

/** Creates a category. */
export function createCategory(body: {
  name: string;
  type: CategoryType;
  color?: string | null;
}) {
  return apiRequest<{ category: Category }>("/categories", {
    method: "POST",
    body
  });
}

/** Updates a category's fields. */
export function updateCategory(
  categoryId: string,
  body: { name: string; type: CategoryType; color?: string | null }
) {
  return apiRequest<{ category: Category }>(`/categories/${categoryId}`, {
    method: "PUT",
    body
  });
}

/** Archives a category. */
export function archiveCategory(categoryId: string) {
  return apiRequest<{ category: Category }>(
    `/categories/${categoryId}/archive`,
    { method: "POST" }
  );
}

/** Restores an archived category. */
export function restoreCategory(categoryId: string) {
  return apiRequest<{ category: Category }>(
    `/categories/${categoryId}/restore`,
    { method: "POST" }
  );
}

/** Deletes a category. */
export function deleteCategory(categoryId: string) {
  return apiRequest<void>(`/categories/${categoryId}`, { method: "DELETE" });
}
