import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import type { Group } from "../../../types/groups.types";
import { GroupsPage } from "../GroupsPage";

const API_URL = "http://localhost:4000";

const authedUser = {
  id: "user-1",
  name: "Jane",
  email: "jane@example.com",
  planType: "free" as const,
  mobileSidebarSide: "left" as const,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

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
        userId: "user-1",
        role: "admin",
        user: { id: "user-1", name: "Jane", email: "jane@example.com" },
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      }
    ],
    categories: [],
    summary: { totalIncome: 1000, totalExpenses: 400, balance: 600 },
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function mockBaseline({
  groups = [] as Group[],
  authed = false
} = {}) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () =>
      authed
        ? HttpResponse.json({ token: "tok", user: authedUser })
        : new HttpResponse(null, { status: 401 })
    ),
    http.get(`${API_URL}/groups`, () => HttpResponse.json({ groups })),
    http.get(`${API_URL}/groups/:id`, ({ params }) => {
      const group = groups.find((entry) => entry.id === params.id);
      return group
        ? HttpResponse.json({ group })
        : new HttpResponse(null, { status: 404 });
    }),
    http.get(`${API_URL}/categories`, () => HttpResponse.json({ categories: [] }))
  );
}

describe("GroupsPage", () => {
  it("shows a prompt to select a group when none is selected", async () => {
    mockBaseline({ groups: [makeGroup()] });
    renderWithProviders(<GroupsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Roommates")).toBeInTheDocument());
    expect(screen.getByText("Select a group to view details.")).toBeInTheDocument();
  });

  it("selects a group and shows its detail sections", async () => {
    mockBaseline({ groups: [makeGroup()], authed: true });
    const user = userEvent.setup();
    renderWithProviders(<GroupsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Roommates")).toBeInTheDocument());
    await user.click(screen.getByText("Roommates"));

    await waitFor(() => expect(screen.getByText("Group summary")).toBeInTheDocument());
    expect(screen.getByText("Members")).toBeInTheDocument();
    expect(screen.getByText("Group categories")).toBeInTheDocument();
    expect(screen.getByText("Latest Group Transactions")).toBeInTheDocument();
  });

  it("deselects the group when clicking it again", async () => {
    mockBaseline({ groups: [makeGroup()], authed: true });
    const user = userEvent.setup();
    renderWithProviders(<GroupsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Roommates")).toBeInTheDocument());
    await user.click(screen.getByText("Roommates"));
    await waitFor(() => expect(screen.getByText("Group summary")).toBeInTheDocument());

    await user.click(document.getElementById("group-group-1")!);

    await waitFor(() =>
      expect(screen.getByText("Select a group to view details.")).toBeInTheDocument()
    );
  });

  it("grants manage actions (Edit) when the authed user is an admin member", async () => {
    mockBaseline({ groups: [makeGroup()], authed: true });
    const user = userEvent.setup();
    renderWithProviders(<GroupsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Roommates")).toBeInTheDocument());
    await user.click(screen.getByText("Roommates"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument());
  });

  it("withholds manage actions when the authed user is not an admin member", async () => {
    mockBaseline({
      groups: [
        makeGroup({
          members: [
            {
              id: "m1",
              groupId: "group-1",
              userId: "user-1",
              role: "member",
              user: { id: "user-1", name: "Jane", email: "jane@example.com" },
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-01T00:00:00.000Z"
            }
          ]
        })
      ],
      authed: true
    });
    const user = userEvent.setup();
    renderWithProviders(<GroupsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Roommates")).toBeInTheDocument());
    await user.click(screen.getByText("Roommates"));

    await waitFor(() => expect(screen.getByText("Member")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("auto-selects and scrolls to the group named in ?groupId=", async () => {
    mockBaseline({ groups: [makeGroup({ id: "group-highlighted" })], authed: true });
    renderWithProviders(<GroupsPage />, {
      withAuth: true,
      route: "/groups?groupId=group-highlighted"
    });

    await waitFor(() => expect(screen.getByText("Group summary")).toBeInTheDocument());
  });

  it("opens the create-group form via the AddRecordButton", async () => {
    mockBaseline({ groups: [] });
    const user = userEvent.setup();
    renderWithProviders(<GroupsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("No groups found.")).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: "Add group" })[0]!);

    expect(screen.getByText("New group")).toBeInTheDocument();
  });
});
