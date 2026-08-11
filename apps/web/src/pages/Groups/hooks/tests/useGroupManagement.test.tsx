import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Group } from "../../../../types/groups.types";
import { useGroupManagement } from "../useGroupManagement";

const API_URL = "http://localhost:4000";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

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

function renderManagement(selectedGroup: Group | null = null) {
  const setSelectedGroupId = vi.fn();
  const result = renderHook(
    () =>
      useGroupManagement({
        selectedGroupId: selectedGroup?.id ?? null,
        setSelectedGroupId,
        selectedGroup
      }),
    { wrapper }
  );
  return { setSelectedGroupId, ...result };
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("useGroupManagement", () => {
  it("starts with the create/edit forms closed", () => {
    const { result } = renderManagement();
    expect(result.current.isCreateOpen).toBe(false);
    expect(result.current.isEditingGroup).toBe(false);
  });

  it("submitCreate creates a group and selects it", async () => {
    server.use(
      http.post(`${API_URL}/groups`, () => HttpResponse.json({ group: makeGroup({ id: "group-2" }) }))
    );
    const { result, setSelectedGroupId } = renderManagement();

    act(() => result.current.setName("Roommates"));
    await act(async () => {
      await result.current.submitCreate({ preventDefault: () => {} } as React.FormEvent);
    });

    expect(setSelectedGroupId).toHaveBeenCalledWith("group-2");
    expect(result.current.isCreateOpen).toBe(false);
    expect(result.current.name).toBe("");
  });

  it("openGroupEditForm/closeGroupEditForm populate and reset edit state", () => {
    const { result } = renderManagement();

    act(() => result.current.openGroupEditForm(makeGroup({ description: "Shared flat" })));
    expect(result.current.isEditingGroup).toBe(true);
    expect(result.current.editGroupName).toBe("Roommates");
    expect(result.current.editGroupDescription).toBe("Shared flat");

    act(() => result.current.closeGroupEditForm());
    expect(result.current.isEditingGroup).toBe(false);
    expect(result.current.editGroupName).toBe("");
  });

  it("submitGroupEdit updates the selected group", async () => {
    let updatedBody: unknown;
    server.use(
      http.put(`${API_URL}/groups/group-1`, async ({ request }) => {
        updatedBody = await request.json();
        return HttpResponse.json({ group: makeGroup({ name: "New name" }) });
      })
    );
    const group = makeGroup();
    const { result } = renderManagement(group);

    act(() => result.current.openGroupEditForm(group));
    act(() => result.current.setEditGroupName("New name"));

    await act(async () => {
      await result.current.submitGroupEdit({ preventDefault: () => {} } as React.FormEvent);
    });

    expect(updatedBody).toMatchObject({ name: "New name" });
    expect(result.current.isEditingGroup).toBe(false);
  });

  it("submitGroupEdit is a no-op when there is no selectedGroup", async () => {
    let called = false;
    server.use(
      http.put(`${API_URL}/groups/group-1`, () => {
        called = true;
        return HttpResponse.json({ group: makeGroup() });
      })
    );
    const { result } = renderManagement(null);

    await act(async () => {
      await result.current.submitGroupEdit({ preventDefault: () => {} } as React.FormEvent);
    });

    expect(called).toBe(false);
  });

  it("addMember adds a member to the currently selected group", async () => {
    let addedUserId: unknown;
    server.use(
      http.post(`${API_URL}/groups/group-1/members`, async ({ request }) => {
        addedUserId = ((await request.json()) as { userId: string }).userId;
        return HttpResponse.json({
          member: {
            id: "m1",
            groupId: "group-1",
            userId: "user-2",
            role: "member",
            user: { id: "user-2", name: "Jane", email: "jane@example.com" },
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
          }
        });
      })
    );
    const { result } = renderManagement(makeGroup());

    await act(async () => {
      await result.current.addMember.mutateAsync("user-2");
    });

    expect(addedUserId).toBe("user-2");
  });

  it("archiveGroup archives and deselects the group", async () => {
    server.use(
      http.post(`${API_URL}/groups/group-1/archive`, () =>
        HttpResponse.json({ group: makeGroup({ isArchived: true }) })
      )
    );
    const { result, setSelectedGroupId } = renderManagement(makeGroup());

    await act(async () => {
      await result.current.archiveGroup.mutateAsync("group-1");
    });

    expect(setSelectedGroupId).toHaveBeenCalledWith(null);
  });

  it("confirmDeleteGroup deletes only after confirmation and deselects", async () => {
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/groups/group-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const { result, setSelectedGroupId } = renderManagement(makeGroup());

    await act(async () => {
      await result.current.confirmDeleteGroup(makeGroup());
    });

    expect(deleted).toBe(true);
    expect(setSelectedGroupId).toHaveBeenCalledWith(null);
  });

  it("confirmDeleteGroup does not delete when the confirmation is dismissed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/groups/group-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const { result } = renderManagement(makeGroup());

    await act(async () => {
      await result.current.confirmDeleteGroup(makeGroup());
    });

    expect(deleted).toBe(false);
  });

  it("only enables the user search once a group is selected and the search is longer than 1 char", async () => {
    const { result: withoutSelection } = renderManagement(null);
    act(() => withoutSelection.current.setUserSearch("ja"));
    expect(withoutSelection.current.userSearchQuery.fetchStatus).toBe("idle");

    server.use(
      http.get(`${API_URL}/users/search`, () =>
        HttpResponse.json({ users: [{ id: "user-2", name: "Jane", email: "jane@example.com" }] })
      )
    );
    const { result: withSelection } = renderManagement(makeGroup());
    act(() => withSelection.current.setUserSearch("ja"));

    await waitFor(() => expect(withSelection.current.userSearchQuery.data).toBeDefined());
  });
});
