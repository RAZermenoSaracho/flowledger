import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Group } from "../../../../types/groups.types";
import { useGroupForm } from "../../hooks/useGroupForm";
import { GroupHeader } from "../GroupHeader";

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

function Harness({ group, canEdit }: { group: Group; canEdit: boolean }) {
  const draft = useGroupForm(group);
  return <GroupHeader group={group} draft={draft} canEdit={canEdit} />;
}

function renderHeader(
  group: Group,
  canManage = true,
  canEdit = canManage && !group.isArchived
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness group={group} canEdit={canEdit} />
    </QueryClientProvider>
  );
}

describe("GroupHeader", () => {
  it("renders name and description as live controls for an editor", () => {
    renderHeader(makeGroup());
    expect(screen.getByLabelText("Name")).toHaveValue("Roommates");
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Shared apartment"
    );
    expect(
      screen.queryByRole("button", { name: "Edit" })
    ).not.toBeInTheDocument();
  });

  it("renders read-only text for a non-admin", () => {
    renderHeader(makeGroup(), false);
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByText("Roommates")).toBeInTheDocument();
  });

  it("keeps fields read-only for an archived group", () => {
    renderHeader(makeGroup({ isArchived: true }));
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("shows a field error when the name is cleared", async () => {
    const user = userEvent.setup();
    renderHeader(makeGroup());

    await user.clear(screen.getByLabelText("Name"));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
