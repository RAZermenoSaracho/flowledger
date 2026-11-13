import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CategoryCard } from "../../Categories/components/CategoryCard";
import { CategoryForm } from "../../Categories/components/CategoryForm";
import { ListView } from "../../../components/ListView";
import { ModalDialog } from "../../../components/ModalDialog";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";
import {
  createConditionWithValue,
  createEmptyGroup
} from "../../../utils/searchDomain";
import * as categoriesClient from "../../../services/categories.client";
import {
  buildCategorySearchFields,
  CATEGORY_DEFAULT_SEARCH_FIELD,
  CATEGORY_SORTABLE_FIELDS
} from "../../Categories/utils/categorySearchFields";
import type { useGroupCategoryManagement } from "../hooks/useGroupCategoryManagement";

const initialGroupCategoryDomain = {
  ...createEmptyGroup("and"),
  children: [createConditionWithValue("isArchived", "=", "false")]
};

/**
 * Card grid of a group's shared categories with its own search/filter controls (a query scoped
 * to this group). Managers get a "+" that opens a create modal and a per-card menu with in-place
 * edit; every change saves on its own through `categoryManagement` and never touches the Group
 * draft. Closing the create modal with unsaved input asks for confirmation first.
 */
export function GroupCategoriesSection({
  groupId,
  canManageActive,
  categoryManagement
}: {
  groupId: string;
  canManageActive: boolean;
  categoryManagement: ReturnType<typeof useGroupCategoryManagement>;
}) {
  const [categoryQuery, setCategoryQuery] = useState<SearchBarQuery>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDirty, setCreateDirty] = useState(false);
  const categorySearchFields = useMemo(() => buildCategorySearchFields(), []);

  const groupCategoriesQuery = useQuery({
    queryKey: ["categories", "group", groupId, categoryQuery],
    queryFn: async () =>
      (
        await categoriesClient.listCategories({
          groupId,
          where: categoryQuery.where,
          sort: categoryQuery.sort
        })
      ).categories
  });

  const categories = groupCategoriesQuery.data ?? [];
  const { editingCategoryId } = categoryManagement;

  function requestCloseCreate() {
    if (createDirty && !window.confirm("Discard unsaved changes?")) return;
    setIsCreateOpen(false);
    setCreateDirty(false);
  }

  return (
    <>
      <ListView
        title="Group categories"
        actions={
          canManageActive ? (
            <button
              type="button"
              aria-label="Add category"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-pine text-white transition hover:bg-pine/90 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:bg-emerald-700 dark:hover:bg-emerald-600 dark:focus:ring-offset-slate-950"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null
        }
        toolbar={
          <SearchBar
            fields={categorySearchFields}
            sortableFields={CATEGORY_SORTABLE_FIELDS}
            defaultSearchField={CATEGORY_DEFAULT_SEARCH_FIELD}
            initialSort={{ field: "name", direction: "asc" }}
            initialDomain={initialGroupCategoryDomain}
            placeholder="Search group categories"
            onQueryChange={setCategoryQuery}
          />
        }
        layout="grid"
        items={categories}
        rowKey={(category) => category.id}
        renderItem={(category) => (
          <CategoryCard
            category={category}
            isEditing={editingCategoryId === category.id}
            savePending={categoryManagement.updateCategory.isPending}
            onSave={(values) =>
              categoryManagement.updateCategory.mutateAsync({
                id: category.id,
                ...values
              })
            }
            onCancelEdit={categoryManagement.closeCategoryEditForm}
            actions={
              canManageActive
                ? {
                    onEdit: () =>
                      categoryManagement.openCategoryEditForm(category),
                    onArchive: () =>
                      categoryManagement.archiveCategory.mutate(category.id),
                    onRestore: () =>
                      categoryManagement.restoreCategory.mutate(category.id),
                    onDelete: () =>
                      categoryManagement.confirmDeleteCategory(category),
                    archivePending: categoryManagement.archiveCategory.isPending,
                    restorePending:
                      categoryManagement.restoreCategory.isPending,
                    deletePending: categoryManagement.deleteCategory.isPending
                  }
                : undefined
            }
          />
        )}
        isLoading={groupCategoriesQuery.isLoading}
        error={groupCategoriesQuery.error?.message}
        emptyText="No group categories found."
      />
      {isCreateOpen ? (
        <ModalDialog
          titleId="new-group-category-title"
          title="New group category"
          titleClassName="mb-4 text-lg font-semibold"
          onCancel={requestCloseCreate}
        >
          <CategoryForm
            submitLabel="Add category"
            pending={categoryManagement.addCategory.isPending}
            onDirtyChange={setCreateDirty}
            onCancel={requestCloseCreate}
            onSubmit={async (values) => {
              await categoryManagement.addCategory.mutateAsync(values);
              setIsCreateOpen(false);
              setCreateDirty(false);
            }}
          />
        </ModalDialog>
      ) : null}
    </>
  );
}
