import { CATEGORY_TYPES } from "@flowledger/shared";
import type { CategoryType } from "@flowledger/shared";
import { Button } from "../../../components/Button";
import { SelectField, TextInput } from "../../../components/FormField";
import { formatEnumLabel } from "../../../utils/enumLabels";
import type { useGroupCategoryManagement } from "../hooks/useGroupCategoryManagement";

/** Inline form for editing one group category; saves immediately through `categoryManagement`, never through the Group draft. */
export function GroupCategoryEditForm({
  categoryManagement
}: {
  categoryManagement: ReturnType<typeof useGroupCategoryManagement>;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800">
      <form
        className="grid gap-3"
        onSubmit={categoryManagement.submitCategoryEdit}
      >
        <TextInput
          label="Name"
          value={categoryManagement.editCategoryName}
          onChange={(event) =>
            categoryManagement.setEditCategoryName(event.target.value)
          }
          required
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Type"
            value={categoryManagement.editCategoryType}
            onChange={(event) =>
              categoryManagement.setEditCategoryType(
                event.target.value as CategoryType
              )
            }
          >
            {CATEGORY_TYPES.map((item) => (
              <option key={item} value={item}>
                {formatEnumLabel(item)}
              </option>
            ))}
          </SelectField>
          <TextInput
            label="Color"
            type="color"
            value={categoryManagement.editCategoryColor}
            onChange={(event) =>
              categoryManagement.setEditCategoryColor(event.target.value)
            }
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            disabled={categoryManagement.updateCategory.isPending}
          >
            Save changes
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={categoryManagement.closeCategoryEditForm}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
