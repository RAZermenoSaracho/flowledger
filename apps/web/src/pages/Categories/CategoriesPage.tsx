import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AddRecordButton } from "../../components/AddRecordButton";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { CategoryCard } from "../../components/CategoryCard";
import { CategoryForm } from "../../components/CategoryForm";
import { PageHeader } from "../../components/PageHeader";
import { groupByFields } from "../../components/SearchComponent";
import { SearchBar, type SearchBarQuery } from "../../components/SearchBar";
import {
  createConditionWithValue,
  createEmptyGroup
} from "../../utils/searchDomain";
import * as categoriesClient from "../../services/categories.client";
import type { Category, CategoryFormValues } from "../../types/categories.types";
import {
  buildCategorySearchFields,
  CATEGORY_DEFAULT_SEARCH_FIELD,
  CATEGORY_GROUPABLE_FIELDS,
  CATEGORY_SORTABLE_FIELDS
} from "./utils/categorySearchFields";

// groupByFields (components/SearchComponent.tsx) keys its group defs by
// `id`; SearchBar's GroupableField uses `name` — trivial adapter between
// the two (see TransactionsPage.tsx for the same pattern).
const categoryGroupByDefsForBucketing = CATEGORY_GROUPABLE_FIELDS.map((field) => ({
  id: field.name,
  label: field.label
}));

// Archived categories are excluded by default — same default the old
// dedicated Active/Archived toggle had — but expressed as an ordinary,
// visible, removable FilterBuilder condition instead of hidden logic.
const initialCategoryDomain = {
  ...createEmptyGroup("and"),
  children: [createConditionWithValue("isArchived", "=", "false")]
};

function categoryGroupKey(category: Category, groupById: string) {
  if (groupById === "type")
    return { key: category.type, label: category.type };
  return { key: "", label: "" };
}

/** Categories list page: search/filter/group controls plus the create-category form. */
export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null
  );
  const [categoryQuery, setCategoryQuery] = useState<SearchBarQuery>({});

  const categorySearchFields = useMemo(() => buildCategorySearchFields(), []);

  const categoriesQuery = useQuery({
    queryKey: ["categories", categoryQuery],
    queryFn: async () =>
      (
        await categoriesClient.listCategories({
          where: categoryQuery.where,
          sort: categoryQuery.sort
        })
      ).categories
  });

  const visibleCategories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const activeGroupBys = useMemo(() => categoryQuery.groupBy ?? [], [categoryQuery.groupBy]);
  const groupedCategories = useMemo(
    () =>
      groupByFields(
        visibleCategories,
        activeGroupBys,
        categoryGroupByDefsForBucketing,
        categoryGroupKey
      ),
    [visibleCategories, activeGroupBys]
  );

  const createCategory = useMutation({
    mutationFn: (values: CategoryFormValues) =>
      categoriesClient.createCategory(values),
    onSuccess: async () => {
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    }
  });

  const updateCategory = useMutation({
    mutationFn: (category: { id: string } & CategoryFormValues) =>
      categoriesClient.updateCategory(category.id, {
        name: category.name,
        type: category.type,
        color: category.color
      }),
    onSuccess: async () => {
      setEditingCategoryId(null);
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["category-report"] });
    }
  });

  const archiveCategory = useMutation({
    mutationFn: (categoryId: string) =>
      categoriesClient.archiveCategory(categoryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const restoreCategory = useMutation({
    mutationFn: (categoryId: string) =>
      categoriesClient.restoreCategory(categoryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    }
  });

  const deleteCategory = useMutation({
    mutationFn: (categoryId: string) =>
      categoriesClient.deleteCategory(categoryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["category-report"] });
    }
  });

  async function confirmDelete(category: Category) {
    const confirmed = window.confirm(
      `Delete "${category.name}" permanently? This cannot be undone. Related financial data may also be deleted or disconnected from this category.`
    );
    if (!confirmed) return;
    await deleteCategory.mutateAsync(category.id);
  }

  return (
    <div className="grid gap-6">
      {isFormOpen ? (
        <Card>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-lg font-semibold">New category</h2>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => setIsFormOpen(false)}
              >
                Cancel
              </Button>
            </div>
            <div className="mt-4">
              <CategoryForm
                submitLabel="Save category"
                pending={createCategory.isPending}
                onSubmit={async (values) => {
                  await createCategory.mutateAsync(values);
                }}
              />
            </div>
        </Card>
      ) : null}
      <Card>
        <PageHeader
          title="Categories"
          action={
            <AddRecordButton
              label="category"
              onClick={() => setIsFormOpen(true)}
            />
          }
        >
          <SearchBar
            fields={categorySearchFields}
            groupableFields={CATEGORY_GROUPABLE_FIELDS}
            sortableFields={CATEGORY_SORTABLE_FIELDS}
            defaultSearchField={CATEGORY_DEFAULT_SEARCH_FIELD}
            initialSort={{ field: "name", direction: "asc" }}
            initialDomain={initialCategoryDomain}
            placeholder="Search categories"
            onQueryChange={setCategoryQuery}
          />
        </PageHeader>
        <div className="mt-4 grid gap-4">
          {groupedCategories.map((section) => (
            <div key={section.key || "all"} className="grid gap-3">
              {section.label ? (
                <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
                  {section.label}
                </h3>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {section.items.map((category) => (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    isEditing={editingCategoryId === category.id}
                    savePending={updateCategory.isPending}
                    onSave={(values) =>
                      updateCategory.mutateAsync({ id: category.id, ...values })
                    }
                    onCancelEdit={() => setEditingCategoryId(null)}
                    actions={{
                      onEdit: () => setEditingCategoryId(category.id),
                      onArchive: () => archiveCategory.mutate(category.id),
                      onRestore: () => restoreCategory.mutate(category.id),
                      onDelete: () => confirmDelete(category),
                      archivePending: archiveCategory.isPending,
                      restorePending: restoreCategory.isPending,
                      deletePending: deleteCategory.isPending
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
          {visibleCategories.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No categories found.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
