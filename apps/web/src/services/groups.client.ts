import { apiRequest } from "./api.client";
import type { Category } from "../types/categories.types";
import type { Group, GroupMember } from "../types/groups.types";
import type { CategoryType } from "@flowledger/shared";
import type { CategorySortBy, SortDirection } from "./categories.client";

/** Filter/sort params for listing groups. */
export type ListGroupsParams = {
  includeArchived?: boolean;
  sortBy?: CategorySortBy;
  sortDirection?: SortDirection;
};

/** Fetches the user's groups with archive/sort filters. */
export function listGroups(params: ListGroupsParams = {}) {
  return apiRequest<{ groups: Group[] }>("/groups", {
    query: {
      includeArchived: params.includeArchived ? "true" : undefined,
      sortBy: params.sortBy,
      sortDirection: params.sortDirection
    }
  });
}

/** Options for fetching one group, controlling its nested categories' filter/sort. */
export type GetGroupParams = {
  includeArchivedCategories?: boolean;
  categorySortBy?: CategorySortBy;
  categorySortDirection?: SortDirection;
  categoryTypes?: CategoryType[];
};

/** Fetches one group with its categories and members. */
export function getGroup(groupId: string, params: GetGroupParams = {}) {
  return apiRequest<{ group: Group }>(`/groups/${groupId}`, {
    query: {
      includeArchivedCategories: params.includeArchivedCategories
        ? "true"
        : undefined,
      categorySortBy: params.categorySortBy,
      categorySortDirection: params.categorySortDirection,
      categoryTypes: params.categoryTypes
    }
  });
}

/** Creates a group. */
export function createGroup(body: {
  name: string;
  description?: string | null;
}) {
  return apiRequest<{ group: Group }>("/groups", { method: "POST", body });
}

/** Updates a group's fields. */
export function updateGroup(
  groupId: string,
  body: { name: string; description?: string | null }
) {
  return apiRequest<{ group: Group }>(`/groups/${groupId}`, {
    method: "PUT",
    body
  });
}

/** Archives a group. */
export function archiveGroup(groupId: string) {
  return apiRequest<{ group: Group }>(`/groups/${groupId}/archive`, {
    method: "POST"
  });
}

/** Restores an archived group. */
export function restoreGroup(groupId: string) {
  return apiRequest<{ group: Group }>(`/groups/${groupId}/restore`, {
    method: "POST"
  });
}

/** Deletes a group. */
export function deleteGroup(groupId: string) {
  return apiRequest<void>(`/groups/${groupId}`, { method: "DELETE" });
}

/** Adds a member to a group. */
export function addGroupMember(groupId: string, userId: string) {
  return apiRequest<{ member: GroupMember }>(`/groups/${groupId}/members`, {
    method: "POST",
    body: { userId }
  });
}

/** Removes a member from a group. */
export function removeGroupMember(groupId: string, userId: string) {
  return apiRequest<void>(`/groups/${groupId}/members/${userId}`, {
    method: "DELETE"
  });
}

/** Adds a shared category to a group. */
export function addGroupCategory(
  groupId: string,
  body: { name: string; type: CategoryType; color?: string | null }
) {
  return apiRequest<{ category: Category }>(`/groups/${groupId}/categories`, {
    method: "POST",
    body
  });
}
