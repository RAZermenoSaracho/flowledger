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
  const onCreated = vi.fn();
  const onLeave = vi.fn();
  const result = renderHook(
    () =>
      useGroupManagement({
        selectedGroupId: selectedGroup?.id ?? null,
        onCreated,
        onLeave
      }),
    { wrapper }
  );
  return { onCreated, onLeave, ...result };
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("useGroupManagement", () => {
  it("starts with the create form closed", () => {
    const { result } = renderManagement();
    expect(result.current.isCreateOpen).toBe(false);
  });

  it("submitCreate creates a group and selects it", async () => {
    server.use(
      http.post(`${API_URL}/groups`, () => HttpResponse.json({ group: makeGroup({ id: "group-2" }) }))
    );
    const { result, onCreated } = renderManagement();

    act(() => result.current.setName("Roommates"));
    await act(async () => {
      await result.current.submitCreate({ preventDefault: () => {} } as React.FormEvent);
    });

    expect(onCreated).toHaveBeenCalledWith("group-2");
    expect(result.current.isCreateOpen).toBe(false);
    expect(result.current.name).toBe("");
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
            user: { id: "user-2", username: "jane", displayName: "Jane" },
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

  it("archiveGroup archives and leaves the group", async () => {
    server.use(
      http.post(`${API_URL}/groups/group-1/archive`, () =>
        HttpResponse.json({ group: makeGroup({ isArchived: true }) })
      )
    );
    const { result, onLeave } = renderManagement(makeGroup());

    await act(async () => {
      await result.current.archiveGroup.mutateAsync("group-1");
    });

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("confirmDeleteGroup deletes only after confirmation and leaves", async () => {
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/groups/group-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const { result, onLeave } = renderManagement(makeGroup());

    await act(async () => {
      await result.current.confirmDeleteGroup(makeGroup());
    });

    expect(deleted).toBe(true);
    expect(onLeave).toHaveBeenCalledTimes(1);
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

  it("does not search with fewer than 3 characters", () => {
    const { result } = renderManagement(makeGroup());
    act(() => result.current.setUserSearch("ja"));
    expect(result.current.userSearchQuery.fetchStatus).toBe("idle");
  });

  it("only enables the user search once a group is selected and the search has at least 3 char", async () => {
    const { result: withoutSelection } = renderManagement(null);
    act(() => withoutSelection.current.setUserSearch("jan"));
    expect(withoutSelection.current.userSearchQuery.fetchStatus).toBe("idle");

    server.use(
      http.get(`${API_URL}/users/search`, () =>
        HttpResponse.json({ users: [{ id: "user-2", username: "jane", displayName: "Jane" }] })
      )
    );
    const { result: withSelection } = renderManagement(makeGroup());
    act(() => withSelection.current.setUserSearch("jan"));

    await waitFor(() => expect(withSelection.current.userSearchQuery.data).toBeDefined());
  });
});
