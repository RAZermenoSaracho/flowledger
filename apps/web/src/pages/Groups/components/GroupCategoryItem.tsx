import { CATEGORY_TYPES } from "@flowledger/shared";
import type { CategoryType } from "@flowledger/shared";
import { Button } from "../../../components/Button";
import { SelectField, TextInput } from "../../../components/FormField";
import { RecordCard, type RecordCardAction } from "../../../components/RecordCard";
import { formatEnumLabel } from "../../../utils/enumLabels";
import type { Group } from "../../../types/groups.types";
import type { useGroupCategoryManagement } from "../hooks/useGroupCategoryManagement";

/** One row for a group's shared category, with edit/archive actions when the viewer can manage. */
export function GroupCategoryItem({
  category,
  canManage,
  categoryManagement
}: {
  category: Group["categories"][number];
  canManage: boolean | undefined;
  categoryManagement: ReturnType<typeof useGroupCategoryManagement>;
}) {
  if (categoryManagement.editingCategoryId === category.id) {
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

  const actions: RecordCardAction[] | undefined = canManage
    ? [
        {
          key: "edit",
          label: "Edit",
          onClick: () => categoryManagement.openCategoryEditForm(category)
        },
        category.isArchived
          ? {
              key: "restore",
              label: "Restore",
              disabled: categoryManagement.restoreCategory.isPending,
              onClick: () =>
                categoryManagement.restoreCategory.mutate(category.id)
            }
          : {
              key: "archive",
              label: "Archive",
              disabled: categoryManagement.archiveCategory.isPending,
              onClick: () =>
                categoryManagement.archiveCategory.mutate(category.id)
            },
        {
          key: "delete",
          label: "Delete",
          variant: "danger",
          disabled: categoryManagement.deleteCategory.isPending,
          onClick: () => categoryManagement.confirmDeleteCategory(category)
        }
      ]
    : undefined;

  return (
    <RecordCard
      leading={
        <span
          className="h-4 w-4 shrink-0 rounded-full"
          style={{ background: category.color ?? "#cbd5e1" }}
        />
      }
      title={
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{category.name}</p>
          {category.isArchived ? (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Archived
            </span>
          ) : null}
        </div>
      }
      subtitle={
        <p className="text-slate-500 dark:text-slate-400">
          {formatEnumLabel(category.type)}
        </p>
      }
      actions={actions}
      actionsLabel={`Actions for ${category.name}`}
    />
  );
}
