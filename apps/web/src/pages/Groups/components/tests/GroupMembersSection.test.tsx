import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Group } from "../../../../types/groups.types";
import { useGroupManagement } from "../../hooks/useGroupManagement";
import { GroupMembersSection } from "../GroupMembersSection";

const API_URL = "http://localhost:4000";

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "group-1",
    name: "Roommates",
    ownerUserId: "user-1",
    isArchived: false,
    members: [
      {
        id: "m1",
        groupId: "group-1",
        userId: "user-2",
        role: "member",
        user: { id: "user-2", name: "Jane", email: "jane@example.com" },
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      }
    ],
    categories: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function Harness({ group, canManageActive }: { group: Group; canManageActive: boolean }) {
  const management = useGroupManagement({
    selectedGroupId: group.id,
    setSelectedGroupId: () => {},
    selectedGroup: group
  });
  return (
    <GroupMembersSection group={group} canManageActive={canManageActive} management={management} />
  );
}

function renderSection(group: Group, canManageActive = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness group={group} canManageActive={canManageActive} />
    </QueryClientProvider>
  );
}

describe("GroupMembersSection", () => {
  it("renders each member's name, email, and role", () => {
    renderSection(makeGroup());
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText(/jane@example.com · member/)).toBeInTheDocument();
  });

  it("omits the member-search UI when canManageActive is false", () => {
    renderSection(makeGroup(), false);
    expect(screen.queryByLabelText("Find app user")).not.toBeInTheDocument();
  });

  it("searches app users and adds one as a member", async () => {
    server.use(
      http.get(`${API_URL}/users/search`, () =>
        HttpResponse.json({ users: [{ id: "user-3", name: "Sam", email: "sam@example.com" }] })
      ),
      http.post(`${API_URL}/groups/group-1/members`, () =>
        HttpResponse.json({
          member: {
            id: "m2",
            groupId: "group-1",
            userId: "user-3",
            role: "member",
            user: { id: "user-3", name: "Sam", email: "sam@example.com" },
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
          }
        })
      )
    );
    const user = userEvent.setup();
    renderSection(makeGroup());

    await user.type(screen.getByLabelText("Find app user"), "sam");

    await waitFor(() => expect(screen.getByText("sam@example.com")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Add member" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument()
    );
  });

  it("shows 'No app users found.' when the search returns nothing", async () => {
    server.use(http.get(`${API_URL}/users/search`, () => HttpResponse.json({ users: [] })));
    const user = userEvent.setup();
    renderSection(makeGroup());

    await user.type(screen.getByLabelText("Find app user"), "nobody");

    await waitFor(() => expect(screen.getByText("No app users found.")).toBeInTheDocument());
  });
});
