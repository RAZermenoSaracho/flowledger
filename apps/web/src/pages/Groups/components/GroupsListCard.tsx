import { Card } from "../../../components/Card";
import { SearchComponent } from "../../../components/SearchComponent";
import type { CategorySortBy } from "../../../services/categories.client";
import type { Group } from "../../../types/api";

export function GroupsListCard({
  groupSearch,
  onGroupSearchChange,
  groupSortBy,
  groupSortDirection,
  onGroupSortByChange,
  onGroupSortDirectionChange,
  groupArchiveMode,
  onGroupArchiveModeChange,
  visibleGroups,
  selectedGroupId,
  onSelectGroup
}: {
  groupSearch: string;
  onGroupSearchChange: (value: string) => void;
  groupSortBy: CategorySortBy;
  groupSortDirection: "asc" | "desc";
  onGroupSortByChange: (value: CategorySortBy) => void;
  onGroupSortDirectionChange: (value: "asc" | "desc") => void;
  groupArchiveMode: "active" | "archived";
  onGroupArchiveModeChange: (value: "active" | "archived") => void;
  visibleGroups: Group[];
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
}) {
  return (
    <Card>
      <h2 className="text-lg font-semibold">Groups</h2>
      <div className="mt-4">
        <SearchComponent
          layout="compact"
          searchValue={groupSearch}
          searchPlaceholder="Search groups"
          onSearchChange={onGroupSearchChange}
          sort={{
            value: groupSortBy,
            direction: groupSortDirection,
            onChange: (value) => onGroupSortByChange(value as CategorySortBy),
            onDirectionChange: onGroupSortDirectionChange,
            options: [
              { label: "Name", value: "name" },
              { label: "Created date", value: "createdAt" },
              { label: "Updated date", value: "updatedAt" }
            ]
          }}
          archiveToggle={{
            value: groupArchiveMode,
            onChange: onGroupArchiveModeChange
          }}
        />
      </div>
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
