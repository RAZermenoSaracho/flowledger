import type { SortDirection, WhereNode } from "../utils/searchDomain";
import { apiRequest } from "./api.client";
import type { Category } from "../types/categories.types";
import type { CategoryType } from "@flowledger/shared";

export type { SortDirection };

/** The wire shape `GET /categories` accepts — see apps/api's categories read.service.ts. `groupId`/`scope` choose which categories are visible at all; `where`/`sort` filter within that set. */
export type ListCategoriesParams = {
  groupId?: string;
  scope?: "all";
  where?: WhereNode;
  sort?: { field: string; direction: SortDirection }[];
};

/** Fetches categories, optionally merging personal and group categories via `scope: "all"`. */
export function listCategories(params: ListCategoriesParams = {}) {
  return apiRequest<{ categories: Category[] }>("/categories", {
    query: {
      groupId: params.groupId,
      scope: params.scope,
      query: JSON.stringify({ where: params.where, sort: params.sort })
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
