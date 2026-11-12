import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Group } from "../../../../types/groups.types";
import { useGroupForm } from "../useGroupForm";

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
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

describe("useGroupForm", () => {
  it("starts clean with the group's name and description", () => {
    const { result } = renderHook(() => useGroupForm(makeGroup()), { wrapper });
    expect(result.current.values).toEqual({ name: "Roommates", description: "Shared apartment" });
    expect(result.current.isDirty).toBe(false);
  });

  it("blocks an empty name with a field error", () => {
    const { result } = renderHook(() => useGroupForm(makeGroup()), { wrapper });
    act(() => result.current.setField("name", " "));
    expect(result.current.fieldErrors.name).toBeTruthy();
  });

  it("saves with one PUT, sending a blank description as null", async () => {
    let body: unknown;
    server.use(
      http.put(`${API_URL}/groups/group-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ group: makeGroup() });
      })
    );
    const { result } = renderHook(() => useGroupForm(makeGroup()), { wrapper });

    act(() => {
      result.current.setField("name", "Flat");
      result.current.setField("description", "");
    });
    await act(async () => {
      await result.current.save();
    });

    expect(body).toEqual({ name: "Flat", description: null });
  });

  it("keeps an unsaved edit when the group is refetched with new data", async () => {
    let group = makeGroup();
    const { result, rerender } = renderHook(() => useGroupForm(group), { wrapper });

    act(() => result.current.setField("name", "Mine"));
    group = makeGroup({ members: [{ id: "m1" } as Group["members"][number]] });
    rerender();

    await waitFor(() => expect(result.current.values.name).toBe("Mine"));
    expect(result.current.isDirty).toBe(true);
  });
});
