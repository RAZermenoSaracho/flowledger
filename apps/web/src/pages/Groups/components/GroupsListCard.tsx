import { AddRecordButton } from "../../../components/AddRecordButton";
import { Card } from "../../../components/Card";
import { PageHeader } from "../../../components/PageHeader";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";
import {
  createConditionWithValue,
  createEmptyGroup
} from "../../../utils/searchDomain";
import type { Group } from "../../../types/groups.types";
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

/** Search/sort/list card for choosing which group is selected. */
export function GroupsListCard({
  onQueryChange,
  onAddGroup,
  visibleGroups,
  selectedGroupId,
  onSelectGroup
}: {
  onQueryChange: (query: SearchBarQuery) => void;
  onAddGroup: () => void;
  visibleGroups: Group[];
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
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
      <div className="mt-4 grid max-h-[55vh] gap-3 overflow-y-auto pr-1">
        {visibleGroups.map((group) => (
          <button
            id={`group-${group.id}`}
            key={group.id}
            type="button"
            className={`rounded-md border p-3 text-left transition ${
              selectedGroupId === group.id
                ? "border-pine bg-mint dark:border-emerald-500 dark:bg-emerald-950"
                : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
            }`}
            onClick={() => onSelectGroup(group.id)}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{group.name}</p>
              {group.isArchived ? (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Archived
                </span>
              ) : null}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {group.members.length} members · {group.categories.length}{" "}
              categories
            </p>
          </button>
        ))}
        {visibleGroups.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No groups found.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
