import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import type { Group } from "../../../types/groups.types";
import { GroupsPage } from "../GroupsPage";

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

function renderOverview(route = "/groups") {
  return renderWithProviders(
    <Routes>
      <Route path="/groups" element={<GroupsPage />} />
      <Route path="/groups/:id" element={<LocationProbe />} />
    </Routes>,
    { withAuth: true, route }
  );
}

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
        user: { id: "user-1", username: "jane", nickname: null, displayName: "Jane" },
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
  it("shows groups as cards without any detail beside them", async () => {
    mockBaseline({ groups: [makeGroup()], authed: true });
    renderOverview();

    await waitFor(() => expect(screen.getByText("Roommates")).toBeInTheDocument());
    expect(screen.queryByText("Select a group to view details.")).not.toBeInTheDocument();
    expect(screen.queryByText("Group summary")).not.toBeInTheDocument();
  });

  it("navigates to the group's detail URL when a card is clicked", async () => {
    mockBaseline({ groups: [makeGroup()], authed: true });
    const user = userEvent.setup();
    renderOverview();

    await user.click(await screen.findByText("Roommates"));

    expect(screen.getByTestId("location")).toHaveTextContent("/groups/group-1");
  });

  it("hides archived groups by default and shows them after the chip is removed", async () => {
    server.use(
      http.get(`${API_URL}/groups`, ({ request }) => {
        const where = new URL(request.url).searchParams.get("query") ?? "";
        const hidesArchived = where.includes("isArchived");
        return HttpResponse.json({
          groups: hidesArchived
            ? [makeGroup()]
            : [makeGroup(), makeGroup({ id: "group-2", name: "Old trip", isArchived: true })]
        });
      }),
      http.post(`${API_URL}/auth/refresh`, () => HttpResponse.json({ token: "tok", user: authedUser }))
    );
    const user = userEvent.setup();
    renderOverview();

    await screen.findByText("Roommates");
    expect(screen.queryByText("Old trip")).not.toBeInTheDocument();

    const chip = screen.getByText(/Archived/, { selector: "span, button" });
    expect(chip).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /remove/i }));

    expect(await screen.findByText("Old trip")).toBeInTheDocument();
  });

  it("redirects ?groupId= to /groups/:id", async () => {
    mockBaseline({ groups: [makeGroup()], authed: true });
    renderOverview("/groups?groupId=group-1");

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/groups/group-1")
    );
  });

  it("opens the create-group form via the AddRecordButton", async () => {
    mockBaseline({ groups: [] });
    const user = userEvent.setup();
    renderOverview();

    await waitFor(() => expect(screen.getByText("No groups found.")).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: "Add group" })[0]!);

    expect(screen.getByText("New group")).toBeInTheDocument();
  });

  it("creates a group and opens its detail view", async () => {
    mockBaseline({ groups: [], authed: true });
    server.use(
      http.post(`${API_URL}/groups`, () =>
        HttpResponse.json({ group: makeGroup({ id: "group-9", name: "Trip" }) })
      )
    );
    const user = userEvent.setup();
    renderOverview();

    await waitFor(() => expect(screen.getByText("No groups found.")).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: "Add group" })[0]!);
    await user.type(screen.getByLabelText("Name"), "Trip");
    await user.click(screen.getByRole("button", { name: "Save group" }));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/groups/group-9")
    );
  });
});
