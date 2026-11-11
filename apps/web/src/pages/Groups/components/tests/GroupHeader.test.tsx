import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Group } from "../../../../types/groups.types";
import { useGroupForm } from "../../hooks/useGroupForm";
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

function Harness({
  group,
  canManage,
  canEdit
}: {
  group: Group;
  canManage: boolean;
  canEdit: boolean;
}) {
  const draft = useGroupForm(group);
  const management = useGroupManagement({ selectedGroupId: group.id });
  return (
    <GroupHeader
      group={group}
      draft={draft}
      canEdit={canEdit}
      canManage={canManage}
      management={management}
    />
  );
}

function renderHeader(group: Group, canManage = true, canEdit = canManage && !group.isArchived) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness group={group} canManage={canManage} canEdit={canEdit} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("GroupHeader", () => {
  it("renders name and description as live controls for an editor", () => {
    renderHeader(makeGroup());
    expect(screen.getByLabelText("Name")).toHaveValue("Roommates");
    expect(screen.getByLabelText("Description")).toHaveValue("Shared apartment");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("renders read-only text and no actions for a non-admin", () => {
    renderHeader(makeGroup(), false);
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByText("Roommates")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("keeps fields read-only but offers Restore for an archived group", () => {
    renderHeader(makeGroup({ isArchived: true }));
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("shows a field error when the name is cleared", async () => {
    const user = userEvent.setup();
    renderHeader(makeGroup());

    await user.clear(screen.getByLabelText("Name"));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
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
