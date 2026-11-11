import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card } from "../../components/Card";
import { FormView } from "../../components/FormView";
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

/** Group Form View at `/groups/:id`: directly editable name/description, immediate members and categories lists, summary and transactions. Non-member, unknown or malformed ids all show the same not-found state. */
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

  return (
    <Card className="min-w-0 lg:p-6">
      <FormView
        title={group.name}
        subtitle={`${canManage ? "Admin" : "Member"}${group.isArchived ? " · Archived" : ""}`}
        draft={draft}
        onBack={() => navigate(routes.groups)}
      >
        <div className="mt-4 grid gap-8">
          <GroupHeader
            group={group}
            draft={draft}
            canEdit={canManageActive}
            canManage={canManage}
            management={management}
          />
          <GroupMembersSection
            group={group}
            canManageActive={canManageActive}
            management={management}
          />
          <GroupCategoriesSection
            groupId={group.id}
            canManage={canManage}
            canManageActive={canManageActive}
            categoryManagement={categoryManagement}
          />
          <GroupSummarySection
            summary={
              group.summary ?? { totalIncome: 0, totalExpenses: 0, balance: 0 }
            }
          />
          <GroupTransactionsSection transactions={group.transactions} />
        </div>
      </FormView>
    </Card>
  );
}
