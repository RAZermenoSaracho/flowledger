import { useQuery } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "../../../components/Button";
import { SelectField, TextInput } from "../../../components/FormField";
import { RelatedList } from "../../../components/RelatedList";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";
import { formatEnumLabel } from "../../../utils/enumLabels";
import {
  createConditionWithValue,
  createEmptyGroup
} from "../../../utils/searchDomain";
import * as categoriesClient from "../../../services/categories.client";
import type { Category } from "../../../types/categories.types";
import {
  buildCategorySearchFields,
  CATEGORY_DEFAULT_SEARCH_FIELD,
  CATEGORY_SORTABLE_FIELDS
} from "../../Categories/utils/categorySearchFields";
import { CATEGORY_TYPES } from "@flowledger/shared";
import type { CategoryType } from "@flowledger/shared";
import type { useGroupCategoryManagement } from "../hooks/useGroupCategoryManagement";
import { GroupCategoryEditForm } from "./GroupCategoryEditForm";

// Archived categories are excluded by default — same default the old
// dedicated Active/Archived toggle had — but expressed as an ordinary,
// visible, removable FilterBuilder condition instead of hidden logic.
const initialGroupCategoryDomain = {
  ...createEmptyGroup("and"),
  children: [createConditionWithValue("isArchived", "=", "false")]
};

/** Immediate-mode `RelatedList` of a group's shared categories with its own search/filter controls (a DSQL query scoped to this group); every add, edit, archive and delete saves on its own and never touches the Group draft. */
export function GroupCategoriesSection({
  groupId,
  canManage,
  canManageActive,
  categoryManagement
}: {
  groupId: string;
  canManage: boolean | undefined;
  canManageActive: boolean;
  categoryManagement: ReturnType<typeof useGroupCategoryManagement>;
}) {
  const [categoryQuery, setCategoryQuery] = useState<SearchBarQuery>({});
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

  const visibleGroupCategories = groupCategoriesQuery.data ?? [];

  async function submit(event: FormEvent) {
    await categoryManagement.submitCategory(event);
  }

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-3 pb-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <SearchBar
            fields={categorySearchFields}
            sortableFields={CATEGORY_SORTABLE_FIELDS}
            defaultSearchField={CATEGORY_DEFAULT_SEARCH_FIELD}
            initialSort={{ field: "name", direction: "asc" }}
            initialDomain={initialGroupCategoryDomain}
            placeholder="Search group categories"
            onQueryChange={setCategoryQuery}
          />
        </div>
      </div>
      <RelatedList
        title="Group categories"
        rows={visibleGroupCategories}
        rowKey={(category) => category.id}
        isLoading={groupCategoriesQuery.isLoading}
        emptyText="No group categories found."
        columns={[
          {
            key: "name",
            header: "Category",
            cell: (category) => (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ background: category.color ?? "#cbd5e1" }}
                />
                <span className="break-words font-medium">{category.name}</span>
                {category.isArchived ? (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Archived
                  </span>
                ) : null}
              </div>
            )
          },
          {
            key: "type",
            header: "Type",
            cell: (category) => formatEnumLabel(category.type)
          },
          ...(canManage
            ? [
                {
                  key: "actions",
                  header: "Actions",
                  align: "right" as const,
                  cell: (category: Category) => (
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={`Edit ${category.name}`}
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
                          aria-label={`Restore ${category.name}`}
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
                          aria-label={`Archive ${category.name}`}
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
                        aria-label={`Delete ${category.name}`}
                        disabled={categoryManagement.deleteCategory.isPending}
                        onClick={() =>
                          categoryManagement.confirmDeleteCategory(category)
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  )
                }
              ]
            : [])
        ]}
      />
      {categoryManagement.editingCategoryId ? (
        <div className="mt-4">
          <GroupCategoryEditForm categoryManagement={categoryManagement} />
        </div>
      ) : null}
      {canManageActive ? (
        <form
          className="mt-5 grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_minmax(9rem,12rem)_minmax(5rem,7rem)] 2xl:grid-cols-[minmax(18rem,1fr)_minmax(9rem,12rem)_minmax(5rem,7rem)_auto] 2xl:items-end"
          onSubmit={submit}
        >
          <TextInput
            label="Category"
            value={categoryManagement.categoryName}
            onChange={(event) =>
              categoryManagement.setCategoryName(event.target.value)
            }
            required
          />
          <SelectField
            label="Type"
            value={categoryManagement.categoryType}
            onChange={(event) =>
              categoryManagement.setCategoryType(
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
            value={categoryManagement.categoryColor}
            onChange={(event) =>
              categoryManagement.setCategoryColor(event.target.value)
            }
          />
          <div className="flex items-end lg:col-span-3 2xl:col-span-1">
            <Button
              type="submit"
              className="w-full 2xl:w-auto"
              disabled={categoryManagement.addCategory.isPending}
            >
              Add category
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
