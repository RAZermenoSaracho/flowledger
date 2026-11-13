import { AddRecordButton } from "../../../components/AddRecordButton";
import { ListView } from "../../../components/ListView";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";
import {
  createConditionWithValue,
  createEmptyGroup
} from "../../../utils/searchDomain";
import type { Group } from "../../../types/groups.types";
import { GroupCard } from "./GroupCard";
import {
  buildGroupSearchFields,
  GROUP_DEFAULT_SEARCH_FIELD,
  GROUP_SORTABLE_FIELDS
} from "../utils/groupSearchFields";

const groupSearchFields = buildGroupSearchFields();

// Archived groups are excluded by default — same default the old
// dedicated Active/Archived toggle had — but expressed as an ordinary,
// visible, removable FilterBuilder condition instead of hidden logic.
const initialGroupDomain = {
  ...createEmptyGroup("and"),
  children: [createConditionWithValue("isArchived", "=", "false")]
};

/** Search/sort card with the responsive grid of group cards; each card opens that group's detail view. */
export function GroupsListCard({
  onQueryChange,
  onAddGroup,
  visibleGroups,
  currentUserId,
  isLoading,
  error
}: {
  onQueryChange: (query: SearchBarQuery) => void;
  onAddGroup: () => void;
  visibleGroups: Group[];
  currentUserId: string | undefined;
  isLoading?: boolean;
  error?: string | null;
}) {
  return (
    <ListView
      title="Groups"
      actions={<AddRecordButton label="group" onClick={onAddGroup} />}
      toolbar={
        <SearchBar
          fields={groupSearchFields}
          sortableFields={GROUP_SORTABLE_FIELDS}
          defaultSearchField={GROUP_DEFAULT_SEARCH_FIELD}
          initialSort={{ field: "name", direction: "asc" }}
          initialDomain={initialGroupDomain}
          placeholder="Search groups"
          onQueryChange={onQueryChange}
        />
      }
      layout="grid"
      items={visibleGroups}
      rowKey={(group) => group.id}
      renderItem={(group) => (
        <GroupCard group={group} currentUserId={currentUserId} />
      )}
      isLoading={isLoading}
      error={error}
      emptyText="No groups found."
    />
  );
}
