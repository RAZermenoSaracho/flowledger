import { useQuery } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "../../../components/Button";
import { SelectField, TextInput } from "../../../components/FormField";
import { groupByFields } from "../../../components/SearchComponent";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";
import {
  createConditionWithValue,
  createEmptyGroup
} from "../../../utils/searchDomain";
import * as categoriesClient from "../../../services/categories.client";
import type { Category } from "../../../types/categories.types";
import {
  buildCategorySearchFields,
  CATEGORY_DEFAULT_SEARCH_FIELD,
  CATEGORY_GROUPABLE_FIELDS,
  CATEGORY_SORTABLE_FIELDS
} from "../../Categories/utils/categorySearchFields";
import { CATEGORY_TYPES } from "@flowledger/shared";
import type { CategoryType } from "@flowledger/shared";
import type { useGroupCategoryManagement } from "../hooks/useGroupCategoryManagement";
import { GroupCategoryItem } from "./GroupCategoryItem";

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
const initialGroupCategoryDomain = {
  ...createEmptyGroup("and"),
  children: [createConditionWithValue("isArchived", "=", "false")]
};

function categoryGroupKey(category: Category, groupById: string) {
  if (groupById === "type") {
    return { key: category.type, label: category.type };
  }
  return { key: "", label: "" };
}

/** Section listing and managing a group's shared categories, with its own search/filter/group controls (a DSQL query scoped to this group, independent of the group's `categories` include). */
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
  const activeGroupBys = categoryQuery.groupBy ?? [];
  const groupedGroupCategories = useMemo(
    () =>
      groupByFields(
        visibleGroupCategories,
        activeGroupBys,
        categoryGroupByDefsForBucketing,
        categoryGroupKey
      ),
    [visibleGroupCategories, activeGroupBys]
  );

  async function submit(event: FormEvent) {
    await categoryManagement.submitCategory(event);
  }

  return (
    <section className="min-w-0">
      <h3 className="font-semibold">Group categories</h3>
      <div className="mt-3 flex flex-col gap-3 border-y border-slate-100 py-4 dark:border-slate-800 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <SearchBar
            fields={categorySearchFields}
            groupableFields={CATEGORY_GROUPABLE_FIELDS}
            sortableFields={CATEGORY_SORTABLE_FIELDS}
            defaultSearchField={CATEGORY_DEFAULT_SEARCH_FIELD}
            initialSort={{ field: "name", direction: "asc" }}
            initialDomain={initialGroupCategoryDomain}
            placeholder="Search group categories"
            onQueryChange={setCategoryQuery}
          />
        </div>
      </div>
      <div className="mt-4 grid gap-4">
        {groupedGroupCategories.map((section) => (
          <div key={section.key || "all"} className="grid gap-3">
            {section.label ? (
              <h4 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
                {section.label}
              </h4>
            ) : null}
            <div className="grid gap-3 xl:grid-cols-2">
              {section.items.map((category) => (
                <GroupCategoryItem
                  key={category.id}
                  category={category}
                  canManage={canManage}
                  categoryManagement={categoryManagement}
                />
              ))}
            </div>
          </div>
        ))}
        {visibleGroupCategories.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No group categories found.
          </p>
        ) : null}
      </div>
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
                {item}
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
