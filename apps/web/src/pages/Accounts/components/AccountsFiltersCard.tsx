import { ACCOUNT_TYPES } from "@flowledger/shared";
import {
  groupByFields,
  SearchComponent
} from "../../../components/SearchComponent";
import type { SearchGroupByDef } from "../../../components/SearchComponent";
import type { Account } from "../../../types/accounts.types";
import type { AccountSortBy } from "../../../services/accounts.client";

export const accountGroupByDefs: SearchGroupByDef[] = [
  { id: "type", label: "Type" },
  { id: "source", label: "Source" }
];

export function accountGroupKey(account: Account, groupById: string) {
  if (groupById === "type") {
    return { key: account.type, label: account.type.replace("_", " ") };
  }
  if (groupById === "source") {
    const source = account.source ?? "manual";
    return { key: source, label: source === "synced" ? "Synced" : "Manual" };
  }
  return { key: "", label: "" };
}

export { groupByFields };

export function AccountsFiltersCard({
  search,
  onSearchChange,
  typeFilterValues,
  onTypeFilterValuesChange,
  sourceFilterValues,
  onSourceFilterValuesChange,
  groupBys,
  onGroupBysChange,
  sortBy,
  sortDirection,
  onSortByChange,
  onSortDirectionChange,
  archiveMode,
  onArchiveModeChange
}: {
  search: string;
  onSearchChange: (value: string) => void;
  typeFilterValues: string[];
  onTypeFilterValuesChange: (values: string[]) => void;
  sourceFilterValues: string[];
  onSourceFilterValuesChange: (values: string[]) => void;
  groupBys: string[];
  onGroupBysChange: (values: string[]) => void;
  sortBy: AccountSortBy;
  sortDirection: "asc" | "desc";
  onSortByChange: (value: AccountSortBy) => void;
  onSortDirectionChange: (value: "asc" | "desc") => void;
  archiveMode: "active" | "archived";
  onArchiveModeChange: (value: "active" | "archived") => void;
}) {
  return (
    <SearchComponent
      searchValue={search}
      searchPlaceholder="Search accounts"
      onSearchChange={onSearchChange}
      facets={[
        {
          id: "type",
          label: "Type",
          options: ACCOUNT_TYPES.map((item) => ({
            label: item.replace("_", " "),
            value: item
          }))
        },
        {
          id: "source",
          label: "Source",
          options: [
            { label: "Manual", value: "manual" },
            { label: "Synced", value: "synced" }
          ]
        }
      ]}
      activeFacetValues={{
        type: typeFilterValues,
        source: sourceFilterValues
      }}
      onFacetValuesChange={(facetId, values) => {
        if (facetId === "type") onTypeFilterValuesChange(values);
        if (facetId === "source") onSourceFilterValuesChange(values);
      }}
      groupBys={accountGroupByDefs}
      activeGroupBys={groupBys}
      onGroupBysChange={onGroupBysChange}
      sort={{
        value: sortBy,
        direction: sortDirection,
        onChange: (value) => onSortByChange(value as AccountSortBy),
        onDirectionChange: onSortDirectionChange,
        options: [
          { label: "Name", value: "name" },
          { label: "Created date", value: "createdAt" },
          { label: "Updated date", value: "updatedAt" }
        ]
      }}
      archiveToggle={{
        value: archiveMode,
        onChange: onArchiveModeChange
      }}
    />
  );
}
