import { CATEGORY_TYPES } from "@flowledger/shared";
import type { CategoryType } from "@flowledger/shared";
import { ActionMenu, ActionMenuItem } from "../../../components/ActionMenu";
import { Button } from "../../../components/Button";
import { SelectField, TextInput } from "../../../components/FormField";
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
                  {item}
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

  return (
    <div className="rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800">
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-4 w-4 shrink-0 rounded-full"
            style={{ background: category.color ?? "#cbd5e1" }}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">{category.name}</p>
              {category.isArchived ? (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Archived
                </span>
              ) : null}
            </div>
            <p className="text-slate-500 dark:text-slate-400">
              {category.type}
            </p>
          </div>
        </div>
        {canManage ? (
          <div className="flex shrink-0 items-center gap-2 2xl:justify-end">
            <div className="hidden gap-2 lg:flex">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  categoryManagement.openCategoryEditForm(category)
                }
              >
                Edit
              </Button>
              {category.isArchived ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={categoryManagement.restoreCategory.isPending}
                  onClick={() =>
                    categoryManagement.restoreCategory.mutate(category.id)
                  }
                >
                  Restore
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={categoryManagement.archiveCategory.isPending}
                  onClick={() =>
                    categoryManagement.archiveCategory.mutate(category.id)
                  }
                >
                  Archive
                </Button>
              )}
              <Button
                type="button"
                variant="danger"
                disabled={categoryManagement.deleteCategory.isPending}
                onClick={() =>
                  categoryManagement.confirmDeleteCategory(category)
                }
              >
                Delete
              </Button>
            </div>
            <ActionMenu label={`Actions for ${category.name}`}>
              <ActionMenuItem
                onClick={() =>
                  categoryManagement.openCategoryEditForm(category)
                }
              >
                Edit
              </ActionMenuItem>
              {category.isArchived ? (
                <ActionMenuItem
                  disabled={categoryManagement.restoreCategory.isPending}
                  onClick={() =>
                    categoryManagement.restoreCategory.mutate(category.id)
                  }
                >
                  Restore
                </ActionMenuItem>
              ) : (
                <ActionMenuItem
                  disabled={categoryManagement.archiveCategory.isPending}
                  onClick={() =>
                    categoryManagement.archiveCategory.mutate(category.id)
                  }
                >
                  Archive
                </ActionMenuItem>
              )}
              <ActionMenuItem
                variant="danger"
                disabled={categoryManagement.deleteCategory.isPending}
                onClick={() =>
                  categoryManagement.confirmDeleteCategory(category)
                }
              >
                Delete
              </ActionMenuItem>
            </ActionMenu>
          </div>
        ) : null}
      </div>
    </div>
  );
}
