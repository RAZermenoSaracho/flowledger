import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ActionMenuItem } from "../../components/ActionMenu";
import { Card } from "../../components/Card";
import { FormView } from "../../components/FormView";
import type { FormViewTab } from "../../types/common.types";
import { routes } from "../../constants/routes";
import { useAuth } from "../../hooks/useAuth";
import * as groupsClient from "../../services/groups.client";
import { GroupCategoriesSection } from "./components/GroupCategoriesSection";
import { GroupHeader } from "./components/GroupHeader";
import { GroupMembersSection } from "./components/GroupMembersSection";
import { GroupSummarySection } from "./components/GroupSummarySection";
import { GroupTransactionsSection } from "./components/GroupTransactionsSection";
import { useGroupCategoryManagement } from "./hooks/useGroupCategoryManagement";
import { useGroupForm } from "./hooks/useGroupForm";
import { useGroupManagement } from "./hooks/useGroupManagement";

/** Group Form View at `/groups/:id`: tabs General (name/description, summary, transactions), Members and Categories; members and categories lists save immediately. Non-member, unknown or malformed ids all show the same not-found state. */
export function GroupDetailPage() {
  const { id = "" } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();

  const groupQuery = useQuery({
    queryKey: ["groups", id],
    retry: false,
    queryFn: async () => (await groupsClient.getGroup(id)).group
  });
  const group = groupQuery.data ?? null;

  const draft = useGroupForm(group);
  const management = useGroupManagement({
    selectedGroupId: id,
    onLeave: () => navigate(routes.groups)
  });
  const categoryManagement = useGroupCategoryManagement({
    selectedGroupId: id,
    refreshSelectedGroup: management.refreshSelectedGroup
  });

  if (groupQuery.isLoading) {
    return <Card>Loading...</Card>;
  }
  if (!group) {
    return (
      <Card>
        <h1 className="text-xl font-semibold">Group not found</h1>
        <Link to={routes.groups} className="text-pine underline">
          Back to groups
        </Link>
      </Card>
    );
  }

  const canManage = group.members.some(
    (member) => member.userId === auth.user?.id && member.role === "admin"
  );
  const canManageActive = canManage && !group.isArchived;

  const tabs: FormViewTab[] = [
    {
      id: "general",
      label: "General",
      content: (
        <div className="grid gap-8">
          <GroupHeader group={group} draft={draft} canEdit={canManageActive} />
          <GroupSummarySection
            summary={
              group.summary ?? { totalIncome: 0, totalExpenses: 0, balance: 0 }
            }
          />
          <GroupTransactionsSection transactions={group.transactions} />
        </div>
      )
    },
    {
      id: "members",
      label: "Members",
      content: (
        <GroupMembersSection
          group={group}
          canManageActive={canManageActive}
          management={management}
        />
      )
    },
    {
      id: "categories",
      label: "Categories",
      content: (
        <GroupCategoriesSection
          groupId={group.id}
          canManage={canManage}
          canManageActive={canManageActive}
          categoryManagement={categoryManagement}
        />
      )
    }
  ];

  return (
    <Card className="min-w-0 lg:p-6">
      <FormView
        title={group.name}
        subtitle={`${canManage ? "Admin" : "Member"}${group.isArchived ? " · Archived" : ""}`}
        draft={draft}
        tabs={tabs}
        backLink={{ to: routes.groups, label: "Back to groups" }}
        actions={
          canManage ? (
            <>
              {group.isArchived ? (
                <ActionMenuItem
                  disabled={management.restoreGroup.isPending}
                  onClick={() => management.restoreGroup.mutate(group.id)}
                >
                  Restore
                </ActionMenuItem>
              ) : (
                <ActionMenuItem
                  disabled={management.archiveGroup.isPending}
                  onClick={() => management.archiveGroup.mutate(group.id)}
                >
                  Archive
                </ActionMenuItem>
              )}
              <ActionMenuItem
                variant="danger"
                disabled={management.deleteGroup.isPending}
                onClick={() => management.confirmDeleteGroup(group)}
              >
                Delete
              </ActionMenuItem>
            </>
          ) : undefined
        }
      >
      </FormView>
    </Card>
  );
}
