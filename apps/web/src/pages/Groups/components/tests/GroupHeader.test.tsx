import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Group } from "../../../../types/groups.types";
import { useGroupManagement } from "../../hooks/useGroupManagement";
import { GroupHeader } from "../GroupHeader";

const API_URL = "http://localhost:4000";

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "group-1",
    name: "Roommates",
    description: "Shared apartment",
    ownerUserId: "user-1",
    isArchived: false,
    members: [],
    categories: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function Harness({ group, canManage }: { group: Group; canManage: boolean }) {
  const management = useGroupManagement({
    selectedGroupId: group.id,
    setSelectedGroupId: () => {},
    selectedGroup: group
  });
  return <GroupHeader group={group} canManage={canManage} management={management} />;
}

function renderHeader(group: Group, canManage = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness group={group} canManage={canManage} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("GroupHeader", () => {
  it("renders the group name/description and 'Admin' when canManage", () => {
    renderHeader(makeGroup());
    expect(screen.getByText("Roommates")).toBeInTheDocument();
    expect(screen.getByText("Shared apartment")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("shows 'Member' and no management actions when canManage is false", () => {
    renderHeader(makeGroup(), false);
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("marks an archived group and shows a Restore action", () => {
    renderHeader(makeGroup({ isArchived: true }));
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("opens the edit form and saves changes", async () => {
    let updatedBody: unknown;
    server.use(
      http.put(`${API_URL}/groups/group-1`, async ({ request }) => {
        updatedBody = await request.json();
        return HttpResponse.json({ group: makeGroup({ name: "New name" }) });
      })
    );
    const user = userEvent.setup();
    renderHeader(makeGroup());

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Roommates");

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "New name");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatedBody).toMatchObject({ name: "New name" }));
  });

  it("cancels the edit form without saving", async () => {
    const user = userEvent.setup();
    renderHeader(makeGroup());

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByText("Roommates")).toBeInTheDocument();
  });

  it("archives an active group", async () => {
    let archived = false;
    server.use(
      http.post(`${API_URL}/groups/group-1/archive`, () => {
        archived = true;
        return HttpResponse.json({ group: makeGroup({ isArchived: true }) });
      })
    );
    const user = userEvent.setup();
    renderHeader(makeGroup());

    await user.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(archived).toBe(true));
  });

  it("deletes the group after confirmation", async () => {
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/groups/group-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderHeader(makeGroup());

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleted).toBe(true));
  });
});
