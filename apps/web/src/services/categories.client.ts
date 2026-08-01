import { apiRequest } from "./api";
import type { Category } from "../types/api";
import type { CategoryType } from "@flowledger/shared";

export type CategorySortBy = "name" | "createdAt" | "updatedAt";
export type SortDirection = "asc" | "desc";

export type ListCategoriesParams = {
  groupId?: string;
  scope?: "all";
  includeArchived?: boolean;
  sortBy?: CategorySortBy;
  sortDirection?: SortDirection;
  types?: CategoryType[];
};

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

export function updateCategory(
  categoryId: string,
  body: { name: string; type: CategoryType; color?: string | null }
) {
  return apiRequest<{ category: Category }>(`/categories/${categoryId}`, {
    method: "PUT",
    body
  });
}

export function archiveCategory(categoryId: string) {
  return apiRequest<{ category: Category }>(
    `/categories/${categoryId}/archive`,
    { method: "POST" }
  );
}

export function restoreCategory(categoryId: string) {
  return apiRequest<{ category: Category }>(
    `/categories/${categoryId}/restore`,
    { method: "POST" }
  );
}

export function deleteCategory(categoryId: string) {
  return apiRequest<void>(`/categories/${categoryId}`, { method: "DELETE" });
}
