import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import * as groupsClient from "../../../services/groups.client";
import { searchUsers } from "../../../services/users.client";
import type { Group } from "../../../types/groups.types";

export function useGroupManagement({
  selectedGroupId,
  setSelectedGroupId,
  selectedGroup
}: {
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;
  selectedGroup: Group | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDescription, setEditGroupDescription] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const trimmedUserSearch = userSearch.trim();

  const userSearchQuery = useQuery({
    queryKey: ["users", "search", trimmedUserSearch],
    enabled: Boolean(selectedGroupId) && trimmedUserSearch.length > 1,
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
      setSelectedGroupId(created.group.id);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    }
  });

  const addMember = useMutation({
    mutationFn: (userId: string) =>
      groupsClient.addGroupMember(selectedGroupId!, userId),
    onSuccess: refreshSelectedGroup
  });

  const updateGroup = useMutation({
    mutationFn: (group: { id: string; name: string; description: string }) =>
      groupsClient.updateGroup(group.id, {
        name: group.name,
        description: group.description || null
      }),
    onSuccess: async () => {
      closeGroupEditForm();
      await refreshSelectedGroup();
    }
  });

  const archiveGroup = useMutation({
    mutationFn: (groupId: string) => groupsClient.archiveGroup(groupId),
    onSuccess: async () => {
      setSelectedGroupId(null);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const restoreGroup = useMutation({
    mutationFn: (groupId: string) => groupsClient.restoreGroup(groupId),
    onSuccess: refreshSelectedGroup
  });

  const deleteGroup = useMutation({
    mutationFn: (groupId: string) => groupsClient.deleteGroup(groupId),
    onSuccess: async () => {
      setSelectedGroupId(null);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    await createGroup.mutateAsync();
  }

  async function submitGroupEdit(event: FormEvent) {
    event.preventDefault();
    if (!selectedGroup) return;

    await updateGroup.mutateAsync({
      id: selectedGroup.id,
      name: editGroupName,
      description: editGroupDescription
    });
  }

  function closeCreateForm() {
    setName("");
    setDescription("");
    setIsCreateOpen(false);
  }

  function openGroupEditForm(group: Group) {
    setIsEditingGroup(true);
    setEditGroupName(group.name);
    setEditGroupDescription(group.description ?? "");
  }

  function closeGroupEditForm() {
    setIsEditingGroup(false);
    setEditGroupName("");
    setEditGroupDescription("");
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
    isEditingGroup,
    editGroupName,
    setEditGroupName,
    editGroupDescription,
    setEditGroupDescription,
    userSearch,
    setUserSearch,
    trimmedUserSearch,
    userSearchQuery,
    refreshSelectedGroup,
    createGroup,
    addMember,
    updateGroup,
    archiveGroup,
    restoreGroup,
    deleteGroup,
    submitCreate,
    submitGroupEdit,
    closeCreateForm,
    openGroupEditForm,
    closeGroupEditForm,
    confirmDeleteGroup
  };
}
