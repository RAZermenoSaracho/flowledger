import { Button } from "../../../components/Button";
import {
  EditableField,
  editableControlClassName
} from "../../../components/EditableField";
import type { FormDraft } from "../../../types/common.types";
import type { Group } from "../../../types/groups.types";
import type { useGroupManagement } from "../hooks/useGroupManagement";
import type { GroupDraft } from "../types/groups.types";

/**
 * Group name/description fields on the shared draft (read-only unless `canEdit`) plus the immediate
 * archive/restore/delete actions, shown only to admins (`canManage`). The actions never touch the draft.
 */
export function GroupHeader({
  group,
  draft,
  canEdit,
  canManage,
  management
}: {
  group: Group;
  draft: FormDraft<GroupDraft>;
  canEdit: boolean;
  canManage: boolean | undefined;
  management: ReturnType<typeof useGroupManagement>;
}) {
  function field(key: keyof GroupDraft) {
    return {
      error: draft.fieldErrors[key],
      dirty: draft.changedKeys.includes(key),
      onRevert: () => draft.revertField(key)
    };
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4">
        <EditableField
          label="Name"
          readOnly={!canEdit}
          display={group.name}
          {...field("name")}
        >
          <input
            className={editableControlClassName}
            value={draft.values.name ?? ""}
            onChange={(event) => draft.setField("name", event.target.value)}
          />
        </EditableField>
        <EditableField
          label="Description"
          readOnly={!canEdit}
          display={group.description || "No description"}
          {...field("description")}
        >
          <textarea
            className={editableControlClassName}
            rows={3}
            value={draft.values.description ?? ""}
            onChange={(event) =>
              draft.setField("description", event.target.value)
            }
          />
        </EditableField>
      </div>
      {canManage ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
