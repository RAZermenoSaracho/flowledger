import { CATEGORY_TYPES } from "@flowledger/shared";
import type { CategoryType } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { AddRecordButton } from "../../components/AddRecordButton";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { SelectField, TextInput } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { RecordCard, type RecordCardAction } from "../../components/RecordCard";
import { groupByFields } from "../../components/SearchComponent";
import { SearchBar, type SearchBarQuery } from "../../components/SearchBar";
import {
  createConditionWithValue,
  createEmptyGroup
} from "../../utils/searchDomain";
import * as categoriesClient from "../../services/categories.client";
import type { Category } from "../../types/categories.types";
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
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("expense");
  const [color, setColor] = useState("#176b52");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null
  );
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<CategoryType>("expense");
  const [editColor, setEditColor] = useState("#176b52");
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

  const visibleCategories = categoriesQuery.data ?? [];
  const activeGroupBys = categoryQuery.groupBy ?? [];
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
    mutationFn: () => categoriesClient.createCategory({ name, type, color }),
    onSuccess: async () => {
      setName("");
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    }
  });

  const updateCategory = useMutation({
    mutationFn: (category: {
      id: string;
      name: string;
      type: CategoryType;
      color: string;
    }) =>
      categoriesClient.updateCategory(category.id, {
        name: category.name,
        type: category.type,
        color: category.color
      }),
    onSuccess: async () => {
      closeEditForm();
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

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    await createCategory.mutateAsync();
  }

  function closeForm() {
    setName("");
    setType("expense");
    setColor("#176b52");
    setIsFormOpen(false);
  }

  function openEditForm(category: Category) {
    setEditingCategoryId(category.id);
    setEditName(category.name);
    setEditType(category.type);
    setEditColor(category.color ?? "#176b52");
  }

  function closeEditForm() {
    setEditingCategoryId(null);
    setEditName("");
    setEditType("expense");
    setEditColor("#176b52");
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingCategoryId) return;

    await updateCategory.mutateAsync({
      id: editingCategoryId,
      name: editName,
      type: editType,
      color: editColor
    });
  }

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
                onClick={closeForm}
              >
                Cancel
              </Button>
            </div>
            <form
              className="mt-4 grid gap-4 md:grid-cols-3"
              onSubmit={submitCreate}
            >
              <TextInput
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <SelectField
                label="Type"
                value={type}
                onChange={(event) =>
                  setType(event.target.value as CategoryType)
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
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
              <div className="md:col-span-3">
                <Button type="submit" disabled={createCategory.isPending}>
                  Save category
                </Button>
              </div>
            </form>
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
                {section.items.map((category) =>
                  editingCategoryId === category.id ? (
                    <div
                      key={category.id}
                      className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
                    >
                      <form className="grid gap-3" onSubmit={submitEdit}>
                        <TextInput
                          label="Name"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          required
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <SelectField
                            label="Type"
                            value={editType}
                            onChange={(event) =>
                              setEditType(event.target.value as CategoryType)
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
                            value={editColor}
                            onChange={(event) =>
                              setEditColor(event.target.value)
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="submit"
                            disabled={updateCategory.isPending}
                          >
                            Save changes
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={closeEditForm}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <RecordCard
                      key={category.id}
                      leading={
                        <span
                          className="h-4 w-4 shrink-0 rounded-full"
                          style={{ background: category.color ?? "#cbd5e1" }}
                        />
                      }
                      title={
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold">
                            {category.name}
                          </p>
                          {category.isArchived ? (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              Archived
                            </span>
                          ) : null}
                        </div>
                      }
                      subtitle={
                        <p className="text-slate-500 dark:text-slate-400">
                          {category.type}
                        </p>
                      }
                      actions={
                        [
                          {
                            key: "edit",
                            label: "Edit",
                            onClick: () => openEditForm(category)
                          },
                          category.isArchived
                            ? {
                                key: "restore",
                                label: "Restore",
                                disabled: restoreCategory.isPending,
                                onClick: () =>
                                  restoreCategory.mutate(category.id)
                              }
                            : {
                                key: "archive",
                                label: "Archive",
                                disabled: archiveCategory.isPending,
                                onClick: () =>
                                  archiveCategory.mutate(category.id)
                              },
                          {
                            key: "delete",
                            label: "Delete",
                            variant: "danger",
                            disabled: deleteCategory.isPending,
                            onClick: () => confirmDelete(category)
                          }
                        ] satisfies RecordCardAction[]
                      }
                      actionsLabel={`Actions for ${category.name}`}
                    />
                  )
                )}
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
