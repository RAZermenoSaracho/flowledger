import { Button } from "../../../components/Button";
import { TextInput } from "../../../components/FormField";
import { RelatedList } from "../../../components/RelatedList";
import { formatPublicUser } from "../../../utils/publicUser";
import type { Group } from "../../../types/groups.types";
import type { useGroupManagement } from "../hooks/useGroupManagement";

/** Immediate-mode `RelatedList` of a group's members by public identity (never email) plus, for admins of an active group, a username search that adds a member on its own request. */
export function GroupMembersSection({
  group,
  canManageActive,
  management
}: {
  group: Group;
  canManageActive: boolean;
  management: ReturnType<typeof useGroupManagement>;
}) {
  return (
    <section className="grid gap-4">
      <RelatedList
        title="Members"
        rows={group.members}
        rowKey={(member) => member.id}
        emptyText="No members."
        columns={[
          {
            key: "member",
            header: "Member",
            cell: (member) => (
              <span className="break-words font-medium">
                {formatPublicUser(member.user)}
              </span>
            )
          },
          { key: "role", header: "Role", cell: (member) => member.role }
        ]}
      />
      {canManageActive ? (
        <div className="grid gap-3">
          <TextInput
            label="Find app user"
            value={management.userSearch}
            onChange={(event) => management.setUserSearch(event.target.value)}
            placeholder="Search by username or nickname"
          />
          {management.trimmedUserSearch.length > 0 && management.trimmedUserSearch.length < 3 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Type at least 3 characters to search.
            </p>
          ) : null}
          {management.trimmedUserSearch.length >= 3 ? (
            <div className="grid gap-2">
              {management.userSearchQuery.isFetching ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Searching app users...
                </p>
              ) : (management.userSearchQuery.data ?? []).length > 0 ? (
                (management.userSearchQuery.data ?? []).map((user) => (
                  <div
                    key={user.id}
                    className="flex flex-col justify-between gap-2 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-800 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-medium">
                        {formatPublicUser(user)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full sm:w-auto"
                      disabled={management.addMember.isPending}
                      onClick={() => management.addMember.mutate(user.id)}
                    >
                      Add member
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No app users found.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
