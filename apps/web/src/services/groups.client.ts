import { apiRequest } from "./api.client";
import type { Category } from "../types/categories.types";
import type { Group, GroupMember } from "../types/groups.types";
import type { CategoryType } from "@flowledger/shared";
import type { CategorySortBy, SortDirection } from "./categories.client";

export type ListGroupsParams = {
  includeArchived?: boolean;
  sortBy?: CategorySortBy;
  sortDirection?: SortDirection;
};

export function listGroups(params: ListGroupsParams = {}) {
  return apiRequest<{ groups: Group[] }>("/groups", {
    query: {
      includeArchived: params.includeArchived ? "true" : undefined,
      sortBy: params.sortBy,
      sortDirection: params.sortDirection
    }
  });
}

export type GetGroupParams = {
  includeArchivedCategories?: boolean;
  categorySortBy?: CategorySortBy;
  categorySortDirection?: SortDirection;
  categoryTypes?: CategoryType[];
};

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

export function createGroup(body: {
  name: string;
  description?: string | null;
}) {
  return apiRequest<{ group: Group }>("/groups", { method: "POST", body });
}

export function updateGroup(
  groupId: string,
  body: { name: string; description?: string | null }
) {
  return apiRequest<{ group: Group }>(`/groups/${groupId}`, {
    method: "PUT",
    body
  });
}

export function archiveGroup(groupId: string) {
  return apiRequest<{ group: Group }>(`/groups/${groupId}/archive`, {
    method: "POST"
  });
}

export function restoreGroup(groupId: string) {
  return apiRequest<{ group: Group }>(`/groups/${groupId}/restore`, {
    method: "POST"
  });
}

export function deleteGroup(groupId: string) {
  return apiRequest<void>(`/groups/${groupId}`, { method: "DELETE" });
}

export function addGroupMember(groupId: string, userId: string) {
  return apiRequest<{ member: GroupMember }>(`/groups/${groupId}/members`, {
    method: "POST",
    body: { userId }
  });
}

export function removeGroupMember(groupId: string, userId: string) {
  return apiRequest<void>(`/groups/${groupId}/members/${userId}`, {
    method: "DELETE"
  });
}

export function addGroupCategory(
  groupId: string,
  body: { name: string; type: CategoryType; color?: string | null }
) {
  return apiRequest<{ category: Category }>(`/groups/${groupId}/categories`, {
    method: "POST",
    body
  });
}
