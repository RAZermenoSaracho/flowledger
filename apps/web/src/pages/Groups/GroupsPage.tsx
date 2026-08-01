import type { CategoryType } from "@flowledger/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "../../components/Card";
import { useAuth } from "../../hooks/useAuth";
import type { CategorySortBy } from "../../services/categories.client";
import * as groupsClient from "../../services/groups.client";
import { matchesSearch } from "../../utils/search";
import {
  categoryGroupByDefs,
  groupByFields as groupCategoriesByFields,
  groupCategoryGroupKey,
  GroupCategoriesSection
} from "./components/GroupCategoriesSection";
import { GroupCreateCard } from "./components/GroupCreateCard";
import { GroupHeader } from "./components/GroupHeader";
import { GroupMembersSection } from "./components/GroupMembersSection";
import { GroupSummarySection } from "./components/GroupSummarySection";
import { GroupTransactionsSection } from "./components/GroupTransactionsSection";
import { GroupsListCard } from "./components/GroupsListCard";
import { useGroupCategoryManagement } from "./hooks/useGroupCategoryManagement";
import { useGroupManagement } from "./hooks/useGroupManagement";

export function GroupsPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const highlightedGroupId = searchParams.get("groupId");
  const [groupArchiveMode, setGroupArchiveMode] = useState<
    "active" | "archived"
  >("active");
  const [categoryArchiveMode, setCategoryArchiveMode] = useState<
    "active" | "archived"
  >("active");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupSortBy, setGroupSortBy] = useState<CategorySortBy>("name");
  const [groupSortDirection, setGroupSortDirection] = useState<"asc" | "desc">(
    "asc"
  );
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryTypeFilterValues, setCategoryTypeFilterValues] = useState<
    string[]
  >([]);
  const [categoryGroupBys, setCategoryGroupBys] = useState<string[]>([]);
  const [categorySortBy, setCategorySortBy] = useState<CategorySortBy>("name");
  const [categorySortDirection, setCategorySortDirection] = useState<
    "asc" | "desc"
  >("asc");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const groupsQuery = useQuery({
    queryKey: ["groups", groupArchiveMode, groupSortBy, groupSortDirection],
    queryFn: async () =>
      (
        await groupsClient.listGroups({
          includeArchived: groupArchiveMode === "archived",
          sortBy: groupSortBy,
          sortDirection: groupSortDirection
        })
      ).groups
  });
  const selectedGroupQuery = useQuery({
    queryKey: [
      "groups",
      selectedGroupId,
      categoryArchiveMode,
      categorySortBy,
      categorySortDirection,
      categoryTypeFilterValues
    ],
    enabled: Boolean(selectedGroupId),
    queryFn: async () =>
      (
        await groupsClient.getGroup(selectedGroupId!, {
          includeArchivedCategories: categoryArchiveMode === "archived",
          categorySortBy,
          categorySortDirection,
          categoryTypes: categoryTypeFilterValues as CategoryType[]
        })
      ).group
  });

  const selectedGroup =
    selectedGroupQuery.data ??
    (groupsQuery.data ?? []).find((group) => group.id === selectedGroupId);
  const groupSummary = selectedGroup?.summary ?? {
    totalIncome: 0,
    totalExpenses: 0,
    balance: 0
  };
  const visibleGroups = useMemo(() => {
    return (groupsQuery.data ?? []).filter((group) =>
      matchesSearch([group.name, group.description], groupSearch)
    );
  }, [groupSearch, groupsQuery.data]);
  const visibleGroupCategories = useMemo(() => {
    return (selectedGroup?.categories ?? []).filter((category) =>
      matchesSearch([category.name, category.type], categorySearch)
    );
  }, [categorySearch, selectedGroup?.categories]);

  const groupedGroupCategories = useMemo(
    () =>
      groupCategoriesByFields(
        visibleGroupCategories,
        categoryGroupBys,
        categoryGroupByDefs,
        groupCategoryGroupKey
      ),
    [visibleGroupCategories, categoryGroupBys]
  );
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
          onOpen={() => management.setIsCreateOpen(true)}
          onClose={management.closeCreateForm}
          name={management.name}
          onNameChange={management.setName}
          description={management.description}
          onDescriptionChange={management.setDescription}
          onSubmit={management.submitCreate}
          isSaving={management.createGroup.isPending}
        />
        <GroupsListCard
          groupSearch={groupSearch}
          onGroupSearchChange={setGroupSearch}
          groupSortBy={groupSortBy}
          groupSortDirection={groupSortDirection}
          onGroupSortByChange={setGroupSortBy}
          onGroupSortDirectionChange={setGroupSortDirection}
          groupArchiveMode={groupArchiveMode}
          onGroupArchiveModeChange={setGroupArchiveMode}
          visibleGroups={visibleGroups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={(groupId) => {
            categoryManagement.closeCategoryEditForm();
            setSelectedGroupId(groupId);
          }}
        />
      </div>
      <Card className="lg:p-6">
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
              canManage={canManage}
              canManageActive={canManageActive}
              categorySearch={categorySearch}
              onCategorySearchChange={setCategorySearch}
              categoryTypeFilterValues={categoryTypeFilterValues}
              onCategoryTypeFilterValuesChange={setCategoryTypeFilterValues}
              categoryGroupBys={categoryGroupBys}
              onCategoryGroupBysChange={setCategoryGroupBys}
              categorySortBy={categorySortBy}
              categorySortDirection={categorySortDirection}
              onCategorySortByChange={setCategorySortBy}
              onCategorySortDirectionChange={setCategorySortDirection}
              categoryArchiveMode={categoryArchiveMode}
              onCategoryArchiveModeChange={setCategoryArchiveMode}
              groupedGroupCategories={groupedGroupCategories}
              visibleGroupCategoriesCount={visibleGroupCategories.length}
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
