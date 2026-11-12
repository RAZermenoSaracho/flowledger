import {
  EditableField,
  editableControlClassName
} from "../../../components/EditableField";
import type { FormDraft } from "../../../types/common.types";
import type { Group } from "../../../types/groups.types";
import type { GroupDraft } from "../types/groups.types";

/**
 * Group name/description fields on the shared draft (read-only unless `canEdit`).
 */
export function GroupHeader({
  group,
  draft,
  canEdit
}: {
  group: Group;
  draft: FormDraft<GroupDraft>;
  canEdit: boolean;
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
    </div>
  );
}
