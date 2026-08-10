import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "../../components/Card";
import { useAuth } from "../../hooks/useAuth";
import type { SearchBarQuery } from "../../components/SearchBar";
import * as groupsClient from "../../services/groups.client";
import { GroupCategoriesSection } from "./components/GroupCategoriesSection";
import { GroupCreateCard } from "./components/GroupCreateCard";
import { GroupHeader } from "./components/GroupHeader";
import { GroupMembersSection } from "./components/GroupMembersSection";
import { GroupSummarySection } from "./components/GroupSummarySection";
import { GroupTransactionsSection } from "./components/GroupTransactionsSection";
import { GroupsListCard } from "./components/GroupsListCard";
import { useGroupCategoryManagement } from "./hooks/useGroupCategoryManagement";
import { useGroupManagement } from "./hooks/useGroupManagement";

/** Groups list/detail page: choose a group, manage members/categories, and view its summary. */
export function GroupsPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const highlightedGroupId = searchParams.get("groupId");
  const [groupQuery, setGroupQuery] = useState<SearchBarQuery>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const groupsQuery = useQuery({
    queryKey: ["groups", groupQuery],
    queryFn: async () =>
      (
        await groupsClient.listGroups({
          where: groupQuery.where,
          sort: groupQuery.sort
        })
      ).groups
  });
  const selectedGroupQuery = useQuery({
    queryKey: ["groups", selectedGroupId],
    enabled: Boolean(selectedGroupId),
    queryFn: async () => (await groupsClient.getGroup(selectedGroupId!)).group
  });

  const selectedGroup =
    selectedGroupQuery.data ??
    (groupsQuery.data ?? []).find((group) => group.id === selectedGroupId);
  const groupSummary = selectedGroup?.summary ?? {
    totalIncome: 0,
    totalExpenses: 0,
    balance: 0
  };
  const visibleGroups = groupsQuery.data ?? [];
  const canManage = selectedGroup?.members.some(
    (member) => member.userId === auth.user?.id && member.role === "admin"
  );
  const canManageActive = Boolean(canManage && !selectedGroup?.isArchived);

  const management = useGroupManagement({
    selectedGroupId,
    setSelectedGroupId,
    selectedGroup
  });
  const categoryManagement = useGroupCategoryManagement({
    selectedGroupId,
    refreshSelectedGroup: management.refreshSelectedGroup
  });

  useEffect(() => {
    if (highlightedGroupId && highlightedGroupId !== selectedGroupId) {
      setSelectedGroupId(highlightedGroupId);
    }
  }, [highlightedGroupId, selectedGroupId]);

  useEffect(() => {
    if (!highlightedGroupId || groupsQuery.isLoading) return;

    window.requestAnimationFrame(() => {
      document
        .getElementById(`group-${highlightedGroupId}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [groupsQuery.isLoading, highlightedGroupId]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)] xl:items-start xl:gap-8">
      <div className="grid gap-6 content-start xl:sticky xl:top-6">
        <GroupCreateCard
          isCreateOpen={management.isCreateOpen}
          onClose={management.closeCreateForm}
          name={management.name}
          onNameChange={management.setName}
          description={management.description}
          onDescriptionChange={management.setDescription}
          onSubmit={management.submitCreate}
          isSaving={management.createGroup.isPending}
        />
        <GroupsListCard
          onQueryChange={setGroupQuery}
          onAddGroup={() => management.setIsCreateOpen(true)}
          visibleGroups={visibleGroups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={(groupId) => {
            categoryManagement.closeCategoryEditForm();
            setSelectedGroupId((current) =>
              current === groupId ? null : groupId
            );
          }}
        />
      </div>
      <Card className="min-w-0 lg:p-6">
        {selectedGroup ? (
          <div className="grid gap-8">
            <GroupHeader
              group={selectedGroup}
              canManage={canManage}
              management={management}
            />
            <GroupMembersSection
              group={selectedGroup}
              canManageActive={canManageActive}
              management={management}
            />
            <GroupCategoriesSection
              groupId={selectedGroup.id}
              canManage={canManage}
              canManageActive={canManageActive}
              categoryManagement={categoryManagement}
            />
            <GroupSummarySection summary={groupSummary} />
            <GroupTransactionsSection
              transactions={selectedGroup.transactions}
            />
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Select a group to view details.
          </p>
        )}
      </Card>
    </div>
  );
}
