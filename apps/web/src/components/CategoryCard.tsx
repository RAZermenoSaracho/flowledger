import type { Category, CategoryCardActions, CategoryFormValues } from "../types/categories.types";
import { formatEnumLabel } from "../utils/enumLabels";
import { CategoryForm } from "./CategoryForm";
import { RecordCard, type RecordCardAction } from "./RecordCard";

/**
 * Category list card: color dot, name, Archived badge and type. Pass `actions` to offer
 * Edit / Archive-or-Restore / Delete; omit it for a read-only card. While `isEditing` the card
 * is replaced in place by a `CategoryForm` (Save changes / Cancel) wired to `onSave` / `onCancelEdit`.
 */
export function CategoryCard({
  category,
  actions,
  isEditing,
  savePending,
  onSave,
  onCancelEdit
}: {
  category: Category;
  actions?: CategoryCardActions;
  isEditing?: boolean;
  savePending?: boolean;
  onSave?: (values: CategoryFormValues) => Promise<unknown>;
  onCancelEdit?: () => void;
}) {
  if (isEditing && onSave) {
    return (
      <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <CategoryForm
          initialValues={{
            name: category.name,
            type: category.type,
            color: category.color ?? "#176b52"
          }}
          submitLabel="Save changes"
          pending={savePending}
          onSubmit={onSave}
          onCancel={onCancelEdit}
        />
      </div>
    );
  }

  const menu: RecordCardAction[] | undefined = actions && [
    { key: "edit", label: "Edit", onClick: actions.onEdit },
    category.isArchived
      ? {
          key: "restore",
          label: "Restore",
          disabled: actions.restorePending,
          onClick: actions.onRestore
        }
      : {
          key: "archive",
          label: "Archive",
          disabled: actions.archivePending,
          onClick: actions.onArchive
        },
    {
      key: "delete",
      label: "Delete",
      variant: "danger",
      disabled: actions.deletePending,
      onClick: actions.onDelete
    }
  ];

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
          <p className="truncate font-semibold">{category.name}</p>
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
      actions={menu}
      actionsLabel={`Actions for ${category.name}`}
    />
  );
}
