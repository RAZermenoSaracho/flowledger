import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import type { Group } from "../../../types/groups.types";
import { GroupDetailPage } from "../GroupDetailPage";

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

function makeGroup(
  role: "admin" | "member" = "admin",
  overrides: Partial<Group> = {}
): Group {
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
        role,
        user: {
          id: "user-1",
          username: "jane",
          nickname: null,
          displayName: "Jane"
        },
        createdAt: "",
        updatedAt: ""
      }
    ],
    categories: [],
    transactions: [],
    summary: { totalIncome: 1000, totalExpenses: 400, balance: 600 },
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

function mock(group: Group | null) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () =>
      HttpResponse.json({ token: "tok", user: authedUser })
    ),
    http.get(`${API_URL}/groups`, () =>
      HttpResponse.json({ groups: group ? [group] : [] })
    ),
    http.get(`${API_URL}/groups/:id`, () =>
      group
        ? HttpResponse.json({ group })
        : new HttpResponse(null, { status: 400 })
    ),
    http.get(`${API_URL}/categories`, () =>
      HttpResponse.json({ categories: [] })
    )
  );
}

function renderDetail(id = "group-1") {
  return renderWithProviders(
    <Routes>
      <Route path="/groups" element={<LocationProbe />} />
      <Route path="/groups/:id" element={<GroupDetailPage />} />
    </Routes>,
    { withAuth: true, route: `/groups/${id}` }
  );
}

describe("GroupDetailPage", () => {
  it("shows General, Members and Categories tabs with editable fields for an admin", async () => {
    mock(makeGroup());
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByLabelText("Name")).toHaveValue("Roommates");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "General",
      "Members",
      "Categories"
    ]);
    expect(screen.getByText("Group summary")).toBeInTheDocument();
    expect(screen.getByText("Latest Group Transactions")).toBeInTheDocument();
    expect(screen.queryByLabelText("Find app user")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Members" }));
    expect(screen.getByLabelText("Find app user")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Categories" }));
    expect(screen.getByText("Group categories")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
  });

  it("shows read-only fields and no management actions for a non-admin member", async () => {
    mock(makeGroup("member"));
    renderDetail();

    await screen.findByText("Group summary");
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Members" }));
    expect(screen.queryByLabelText("Find app user")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record actions" })
    ).not.toBeInTheDocument();
  });

  it("keeps an archived group read-only for its admin but offers Restore", async () => {
    mock(makeGroup("admin", { isArchived: true }));
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Record actions" })
    );
    expect(
      screen.getByRole("menuitem", { name: "Restore" })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("shows not-found with a link back for a non-member or unknown id", async () => {
    mock(null);
    renderDetail("nope");

    expect(await screen.findByText("Group not found")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to groups" })
    ).toHaveAttribute("href", "/groups");
  });

  it("saves an edited name through the shared Save", async () => {
    mock(makeGroup());
    let body: unknown;
    server.use(
      http.put(`${API_URL}/groups/group-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ group: makeGroup() });
      })
    );
    const user = userEvent.setup();
    renderDetail();

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Flat");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(body).toMatchObject({ name: "Flat" }));
  });

  it("keeps an unsaved name when a member is added", async () => {
    mock(makeGroup());
    server.use(
      http.get(`${API_URL}/users/search`, () =>
        HttpResponse.json({
          users: [
            { id: "user-3", username: "sam", nickname: null, displayName: null }
          ]
        })
      ),
      http.post(`${API_URL}/groups/group-1/members`, () =>
        HttpResponse.json({ member: { id: "m2" } })
      )
    );
    const user = userEvent.setup();
    renderDetail();

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Flat");
    await user.click(screen.getByRole("tab", { name: "Members" }));
    await user.type(screen.getByLabelText("Find app user"), "sam");
    await user.click(await screen.findByRole("button", { name: "Add member" }));

    await user.click(screen.getByRole("tab", { name: "General" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveValue("Flat")
    );
  });

  it("returns to the overview after deleting the group", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mock(makeGroup());
    server.use(
      http.delete(
        `${API_URL}/groups/group-1`,
        () => new HttpResponse(null, { status: 204 })
      )
    );
    const user = userEvent.setup();
    renderDetail();

    await user.click(
      await screen.findByRole("button", { name: "Record actions" })
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(window.confirm).toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/groups$/)
    );
  });
});
