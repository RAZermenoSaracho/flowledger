import { Button } from "../../../components/Button";
import { TextArea, TextInput } from "../../../components/FormField";
import type { Group } from "../../../types/groups.types";
import type { useGroupManagement } from "../hooks/useGroupManagement";

/** Group name/description header with edit/archive management actions. */
export function GroupHeader({
  group,
  canManage,
  management
}: {
  group: Group;
  canManage: boolean | undefined;
  management: ReturnType<typeof useGroupManagement>;
}) {
  if (management.isEditingGroup) {
    return (
      <form className="grid gap-3" onSubmit={management.submitGroupEdit}>
        <TextInput
          label="Name"
          value={management.editGroupName}
          onChange={(event) => management.setEditGroupName(event.target.value)}
          required
        />
        <TextArea
          label="Description"
          value={management.editGroupDescription}
          onChange={(event) =>
            management.setEditGroupDescription(event.target.value)
          }
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" disabled={management.updateGroup.isPending}>
            Save changes
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={management.closeGroupEditForm}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{group.name}</h2>
          {group.isArchived ? (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Archived
            </span>
          ) : null}
        </div>
        {group.description ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {group.description}
          </p>
        ) : null}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {canManage ? "Admin" : "Member"}
        </p>
      </div>
      {canManage ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => management.openGroupEditForm(group)}
          >
            Edit
          </Button>
          {group.isArchived ? (
            <Button
              type="button"
              variant="secondary"
              disabled={management.restoreGroup.isPending}
              onClick={() => management.restoreGroup.mutate(group.id)}
            >
              Restore
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={management.archiveGroup.isPending}
              onClick={() => management.archiveGroup.mutate(group.id)}
            >
              Archive
            </Button>
          )}
          <Button
            type="button"
            variant="danger"
            disabled={management.deleteGroup.isPending}
            onClick={() => management.confirmDeleteGroup(group)}
          >
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}
