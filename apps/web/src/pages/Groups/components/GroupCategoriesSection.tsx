import { CATEGORY_TYPES } from "@flowledger/shared";
import type { CategoryType } from "@flowledger/shared";
import { FormEvent } from "react";
import { Button } from "../../../components/Button";
import { SelectField, TextInput } from "../../../components/FormField";
import {
  groupByFields,
  SearchComponent
} from "../../../components/SearchComponent";
import type { SearchGroupByDef } from "../../../components/SearchComponent";
import type { CategorySortBy } from "../../../services/categories.client";
import type { Category } from "../../../types/categories.types";
import type { Group } from "../../../types/groups.types";
import type { useGroupCategoryManagement } from "../hooks/useGroupCategoryManagement";
import { GroupCategoryItem } from "./GroupCategoryItem";

export const categoryGroupByDefs: SearchGroupByDef[] = [
  { id: "type", label: "Type" }
];

export function groupCategoryGroupKey(category: Category, groupById: string) {
  if (groupById === "type") {
    return { key: category.type, label: category.type };
  }
  return { key: "", label: "" };
}

export { groupByFields };

export function GroupCategoriesSection({
  canManage,
  canManageActive,
  categorySearch,
  onCategorySearchChange,
  categoryTypeFilterValues,
  onCategoryTypeFilterValuesChange,
  categoryGroupBys,
  onCategoryGroupBysChange,
  categorySortBy,
  categorySortDirection,
  onCategorySortByChange,
  onCategorySortDirectionChange,
  categoryArchiveMode,
  onCategoryArchiveModeChange,
  groupedGroupCategories,
  visibleGroupCategoriesCount,
  categoryManagement
}: {
  canManage: boolean | undefined;
  canManageActive: boolean;
  categorySearch: string;
  onCategorySearchChange: (value: string) => void;
  categoryTypeFilterValues: string[];
  onCategoryTypeFilterValuesChange: (values: string[]) => void;
  categoryGroupBys: string[];
  onCategoryGroupBysChange: (values: string[]) => void;
  categorySortBy: CategorySortBy;
  categorySortDirection: "asc" | "desc";
  onCategorySortByChange: (value: CategorySortBy) => void;
  onCategorySortDirectionChange: (value: "asc" | "desc") => void;
  categoryArchiveMode: "active" | "archived";
  onCategoryArchiveModeChange: (value: "active" | "archived") => void;
  groupedGroupCategories: {
    key: string;
    label: string;
    items: Group["categories"];
  }[];
  visibleGroupCategoriesCount: number;
  categoryManagement: ReturnType<typeof useGroupCategoryManagement>;
}) {
  async function submit(event: FormEvent) {
    await categoryManagement.submitCategory(event);
  }

  return (
    <section>
      <h3 className="font-semibold">Group categories</h3>
      <div className="mt-3 border-y border-slate-100 py-4 dark:border-slate-800">
        <SearchComponent
          searchValue={categorySearch}
          searchPlaceholder="Search group categories"
          onSearchChange={onCategorySearchChange}
          facets={[
            {
              id: "type",
              label: "Type",
              options: CATEGORY_TYPES.map((item) => ({
                label: item,
                value: item
              }))
            }
          ]}
          activeFacetValues={{ type: categoryTypeFilterValues }}
          onFacetValuesChange={(facetId, values) =>
            facetId === "type" && onCategoryTypeFilterValuesChange(values)
          }
          groupBys={categoryGroupByDefs}
          activeGroupBys={categoryGroupBys}
          onGroupBysChange={onCategoryGroupBysChange}
          sort={{
            value: categorySortBy,
            direction: categorySortDirection,
            onChange: (value) =>
              onCategorySortByChange(value as CategorySortBy),
            onDirectionChange: onCategorySortDirectionChange,
            options: [
              { label: "Name", value: "name" },
              { label: "Created date", value: "createdAt" },
              { label: "Updated date", value: "updatedAt" }
            ]
          }}
          archiveToggle={{
            value: categoryArchiveMode,
            onChange: onCategoryArchiveModeChange
          }}
        />
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
        {visibleGroupCategoriesCount === 0 ? (
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
