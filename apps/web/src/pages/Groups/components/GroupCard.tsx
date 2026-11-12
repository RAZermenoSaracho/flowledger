import { Link } from "react-router-dom";
import { routes } from "../../../constants/routes";
import type { Group } from "../../../types/groups.types";

/** Overview card for one group: name, description, member/category counts, the viewer's role and an Archived badge; links to the group's detail view. */
export function GroupCard({
  group,
  currentUserId
}: {
  group: Group;
  currentUserId: string | undefined;
}) {
  const isAdmin = group.members.some(
    (member) => member.userId === currentUserId && member.role === "admin"
  );

  return (
    <Link
      id={`group-${group.id}`}
      to={routes.group(group.id)}
      className="block min-w-0 rounded-md border border-slate-200 p-4 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="break-words font-semibold">{group.name}</p>
        {group.isArchived ? (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Archived
          </span>
        ) : null}
      </div>
      {group.description ? (
        <p className="mt-1 line-clamp-2 break-words text-sm text-slate-500 dark:text-slate-400">
          {group.description}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {group.members.length} members · {group.categories.length} categories ·{" "}
        {isAdmin ? "Admin" : "Member"}
      </p>
    </Link>
  );
}
