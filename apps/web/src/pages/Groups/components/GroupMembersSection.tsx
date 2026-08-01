import { Button } from "../../../components/Button";
import { TextInput } from "../../../components/FormField";
import type { Group } from "../../../types/groups.types";
import type { useGroupManagement } from "../hooks/useGroupManagement";

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
    <section>
      <h3 className="font-semibold">Members</h3>
      <div className="mt-3 grid gap-2">
        {group.members.map((member) => (
          <div
            key={member.id}
            className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950"
          >
            <p className="font-medium">{member.user.name}</p>
            <p className="text-slate-500 dark:text-slate-400">
              {member.user.email} · {member.role}
            </p>
          </div>
        ))}
      </div>
      {canManageActive ? (
        <div className="mt-4 grid gap-3">
          <TextInput
            label="Find app user"
            value={management.userSearch}
            onChange={(event) => management.setUserSearch(event.target.value)}
            placeholder="Search by name or email"
          />
          {management.trimmedUserSearch.length > 1 ? (
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
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {user.email}
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
