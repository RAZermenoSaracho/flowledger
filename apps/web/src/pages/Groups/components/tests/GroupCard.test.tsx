import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Group } from "../../../../types/groups.types";
import { GroupCard } from "../GroupCard";

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "group-1",
    name: "Roommates",
    description: "Shared apartment",
    ownerUserId: "user-1",
    isArchived: false,
    members: [
      {
        id: "m1",
        groupId: "group-1",
        userId: "user-1",
        role: "admin",
        user: { id: "user-1", username: "jane", nickname: null, displayName: "Jane" },
        createdAt: "",
        updatedAt: ""
      }
    ],
    categories: [],
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function renderCard(group: Group, currentUserId = "user-1") {
  return render(
    <MemoryRouter>
      <GroupCard group={group} currentUserId={currentUserId} />
    </MemoryRouter>
  );
}

describe("GroupCard", () => {
  it("shows name, description, counts and admin role, linking to the detail view", () => {
    renderCard(makeGroup());
    expect(screen.getByText("Roommates")).toBeInTheDocument();
    expect(screen.getByText("Shared apartment")).toBeInTheDocument();
    expect(screen.getByText(/1 members · 0 categories · Admin/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/groups/group-1");
  });

  it("shows Member for a non-admin viewer", () => {
    renderCard(makeGroup(), "someone-else");
    expect(screen.getByText(/· Member/)).toBeInTheDocument();
  });

  it("shows an Archived badge for an archived group", () => {
    renderCard(makeGroup({ isArchived: true }));
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });
});
