import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { routes } from "../../constants/routes";
import { useAuth } from "../../hooks/useAuth";
import type { SearchBarQuery } from "../../components/SearchBar";
import * as groupsClient from "../../services/groups.client";
import { GroupCreateCard } from "./components/GroupCreateCard";
import { GroupsListCard } from "./components/GroupsListCard";
import { useGroupManagement } from "./hooks/useGroupManagement";

/** Groups overview at `/groups`: a card grid with search, inline create (which opens the new group), and the legacy `?groupId=` redirect to `/groups/:id`. */
export function GroupsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const legacyGroupId = searchParams.get("groupId");
  const [groupQuery, setGroupQuery] = useState<SearchBarQuery>({});

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

  const management = useGroupManagement({
    selectedGroupId: null,
    onCreated: (groupId) => navigate(routes.group(groupId))
  });

  if (legacyGroupId) {
    return <Navigate replace to={routes.group(legacyGroupId)} />;
  }

  return (
    <div className="grid gap-6">
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
        visibleGroups={groupsQuery.data ?? []}
        currentUserId={auth.user?.id}
      />
    </div>
  );
}
