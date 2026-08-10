import type { SortDirection, WhereNode } from "../utils/searchDomain";
import { apiRequest } from "./api.client";
import type { Category } from "../types/categories.types";
import type { Group, GroupMember } from "../types/groups.types";
import type { CategoryType } from "@flowledger/shared";

export type { SortDirection };

/** The wire shape `GET /groups` accepts — see apps/api's groups read.service.ts. */
export type ListGroupsParams = {
  where?: WhereNode;
  sort?: { field: string; direction: SortDirection }[];
};

/** Fetches the user's groups for a DSQL query. */
export function listGroups(params: ListGroupsParams = {}) {
  return apiRequest<{ groups: Group[] }>("/groups", {
    query: { query: JSON.stringify(params) }
  });
}

/** Fetches one group with its active categories and members. */
export function getGroup(groupId: string) {
  return apiRequest<{ group: Group }>(`/groups/${groupId}`);
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
