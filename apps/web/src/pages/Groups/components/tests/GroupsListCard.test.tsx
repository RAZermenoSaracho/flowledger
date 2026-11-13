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
  it("renders each group as a card linking to its detail view", () => {
    renderWithProviders(
      <GroupsListCard
        onQueryChange={vi.fn()}
        onAddGroup={vi.fn()}
        visibleGroups={[makeGroup()]}
        currentUserId="user-1"
        isLoading={false}
        error={null}
      />
    );

    expect(screen.getByText("Roommates")).toBeInTheDocument();
    expect(screen.getByText(/1 members · 1 categories/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Roommates/ })).toHaveAttribute(
      "href",
      "/groups/group-1"
    );
  });

  it("shows 'No groups found.' when the list is empty", () => {
    renderWithProviders(
      <GroupsListCard
        onQueryChange={vi.fn()}
        onAddGroup={vi.fn()}
        visibleGroups={[]}
        currentUserId="user-1"
        isLoading={false}
        error={null}
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
        currentUserId="user-1"
        isLoading={false}
        error={null}
      />
    );

    await user.click(screen.getAllByRole("button", { name: "Add group" })[0]!);

    expect(onAddGroup).toHaveBeenCalledOnce();
  });

  it("shows loading and error states instead of the empty text", () => {
    const props = { onQueryChange: vi.fn(), onAddGroup: vi.fn(), visibleGroups: [], currentUserId: "user-1", isLoading: false, error: null };
    const { rerender } = renderWithProviders(<GroupsListCard {...props} isLoading />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("No groups found.")).not.toBeInTheDocument();

    rerender(<GroupsListCard {...props} error="Boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  });
});
