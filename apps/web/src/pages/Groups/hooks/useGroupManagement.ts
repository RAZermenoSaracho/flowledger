import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import * as groupsClient from "../../../services/groups.client";
import { searchUsers } from "../../../services/users.client";
import type { Group } from "../../../types/groups.types";

/**
 * State and handlers for creating a group and for the immediate group actions (add member,
 * archive, restore, delete). None of them touch the Form View draft. `onCreated` receives the new
 * group's id; `onLeave` runs after the group is archived or deleted.
 */
export function useGroupManagement({
  selectedGroupId,
  onCreated,
  onLeave
}: {
  selectedGroupId: string | null;
  onCreated?: (groupId: string) => void;
  onLeave?: () => void;
}) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const trimmedUserSearch = userSearch.trim();

  const userSearchQuery = useQuery({
    queryKey: ["users", "search", trimmedUserSearch],
    enabled: Boolean(selectedGroupId) && trimmedUserSearch.length >= 3,
    queryFn: async () => (await searchUsers(trimmedUserSearch)).users
  });

  async function refreshSelectedGroup() {
    setUserSearch("");
    await queryClient.invalidateQueries({ queryKey: ["groups"] });
    await queryClient.invalidateQueries({
      queryKey: ["groups", selectedGroupId]
    });
  }

  const createGroup = useMutation({
    mutationFn: () =>
      groupsClient.createGroup({ name, description: description || null }),
    onSuccess: async (created) => {
      closeCreateForm();
      onCreated?.(created.group.id);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    }
  });

  const addMember = useMutation({
    mutationFn: (userId: string) =>
      groupsClient.addGroupMember(selectedGroupId!, userId),
    onSuccess: refreshSelectedGroup
  });

  const archiveGroup = useMutation({
    mutationFn: (groupId: string) => groupsClient.archiveGroup(groupId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onLeave?.();
    }
  });

  const restoreGroup = useMutation({
    mutationFn: (groupId: string) => groupsClient.restoreGroup(groupId),
    onSuccess: refreshSelectedGroup
  });

  const deleteGroup = useMutation({
    mutationFn: (groupId: string) => groupsClient.deleteGroup(groupId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onLeave?.();
    }
  });

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    await createGroup.mutateAsync();
  }

  function closeCreateForm() {
    setName("");
    setDescription("");
    setIsCreateOpen(false);
  }

  async function confirmDeleteGroup(group: Group) {
    const confirmed = window.confirm(
      `Delete "${group.name}" permanently? This cannot be undone. Related transactions, categories, members, and shared financial data may also be deleted or disconnected from this group.`
    );
    if (!confirmed) return;
    await deleteGroup.mutateAsync(group.id);
  }

  return {
    isCreateOpen,
    setIsCreateOpen,
    name,
    setName,
    description,
    setDescription,
    userSearch,
    setUserSearch,
    trimmedUserSearch,
    userSearchQuery,
    refreshSelectedGroup,
    createGroup,
    addMember,
    archiveGroup,
    restoreGroup,
    deleteGroup,
    submitCreate,
    closeCreateForm,
    confirmDeleteGroup
  };
}
