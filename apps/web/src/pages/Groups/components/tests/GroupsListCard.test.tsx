import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Group } from "../../../../types/groups.types";
import { GroupsListCard } from "../GroupsListCard";

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "group-1",
    name: "Roommates",
    ownerUserId: "user-1",
    isArchived: false,
    members: [{ id: "m1" } as Group["members"][number]],
    categories: [{ id: "c1" } as Group["categories"][number]],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("GroupsListCard", () => {
  it("renders each group's name, member/category counts", () => {
    renderWithProviders(
      <GroupsListCard
        onQueryChange={vi.fn()}
        onAddGroup={vi.fn()}
        visibleGroups={[makeGroup()]}
        selectedGroupId={null}
        onSelectGroup={vi.fn()}
      />
    );

    expect(screen.getByText("Roommates")).toBeInTheDocument();
    expect(screen.getByText("1 members · 1 categories")).toBeInTheDocument();
  });

  it("marks an archived group with a badge", () => {
    renderWithProviders(
      <GroupsListCard
        onQueryChange={vi.fn()}
        onAddGroup={vi.fn()}
        visibleGroups={[makeGroup({ isArchived: true })]}
        selectedGroupId={null}
        onSelectGroup={vi.fn()}
      />
    );

    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("calls onSelectGroup when a group button is clicked", async () => {
    const user = userEvent.setup();
    const onSelectGroup = vi.fn();
    renderWithProviders(
      <GroupsListCard
        onQueryChange={vi.fn()}
        onAddGroup={vi.fn()}
        visibleGroups={[makeGroup()]}
        selectedGroupId={null}
        onSelectGroup={onSelectGroup}
      />
    );

    await user.click(screen.getByText("Roommates"));

    expect(onSelectGroup).toHaveBeenCalledWith("group-1");
  });

  it("highlights the selected group", () => {
    renderWithProviders(
      <GroupsListCard
        onQueryChange={vi.fn()}
        onAddGroup={vi.fn()}
        visibleGroups={[makeGroup()]}
        selectedGroupId="group-1"
        onSelectGroup={vi.fn()}
      />
    );

    expect(document.getElementById("group-group-1")).toHaveClass("border-pine");
  });

  it("shows 'No groups found.' when the list is empty", () => {
    renderWithProviders(
      <GroupsListCard
        onQueryChange={vi.fn()}
        onAddGroup={vi.fn()}
        visibleGroups={[]}
        selectedGroupId={null}
        onSelectGroup={vi.fn()}
      />
    );

    expect(screen.getByText("No groups found.")).toBeInTheDocument();
  });

  it("calls onAddGroup from the AddRecordButton", async () => {
    const user = userEvent.setup();
    const onAddGroup = vi.fn();
    renderWithProviders(
      <GroupsListCard
        onQueryChange={vi.fn()}
        onAddGroup={onAddGroup}
        visibleGroups={[]}
        selectedGroupId={null}
        onSelectGroup={vi.fn()}
      />
    );

    await user.click(screen.getAllByRole("button", { name: "Add group" })[0]!);

    expect(onAddGroup).toHaveBeenCalledOnce();
  });
});
