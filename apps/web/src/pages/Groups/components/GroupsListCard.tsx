import { AddRecordButton } from "../../../components/AddRecordButton";
import { Card } from "../../../components/Card";
import { PageHeader } from "../../../components/PageHeader";
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
  currentUserId
}: {
  onQueryChange: (query: SearchBarQuery) => void;
  onAddGroup: () => void;
  visibleGroups: Group[];
  currentUserId: string | undefined;
}) {
  return (
    <Card>
      <PageHeader
        title="Groups"
        action={<AddRecordButton label="group" onClick={onAddGroup} />}
      >
        <SearchBar
          fields={groupSearchFields}
          sortableFields={GROUP_SORTABLE_FIELDS}
          defaultSearchField={GROUP_DEFAULT_SEARCH_FIELD}
          initialSort={{ field: "name", direction: "asc" }}
          initialDomain={initialGroupDomain}
          placeholder="Search groups"
          onQueryChange={onQueryChange}
        />
      </PageHeader>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleGroups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            currentUserId={currentUserId}
          />
        ))}
      </div>
      {visibleGroups.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          No groups found.
        </p>
      ) : null}
    </Card>
  );
}
