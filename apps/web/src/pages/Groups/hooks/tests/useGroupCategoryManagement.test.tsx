import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Category } from "../../../../types/categories.types";
import { useGroupCategoryManagement } from "../useGroupCategoryManagement";

const API_URL = "http://localhost:4000";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    groupId: "group-1",
    name: "Groceries",
    type: "expense",
    color: "#176b52",
    isArchived: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function renderCategoryManagement(refreshSelectedGroup = vi.fn().mockResolvedValue(undefined)) {
  const result = renderHook(
    () => useGroupCategoryManagement({ selectedGroupId: "group-1", refreshSelectedGroup }),
    { wrapper }
  );
  return { refreshSelectedGroup, ...result };
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("useGroupCategoryManagement", () => {
  it("starts with no editingCategoryId and default add-category state", () => {
    const { result } = renderCategoryManagement();
    expect(result.current.editingCategoryId).toBeNull();
    expect(result.current.categoryType).toBe("expense");
  });

  it("submitCategory adds a category to the group and refreshes", async () => {
    server.use(
      http.post(`${API_URL}/groups/group-1/categories`, () =>
        HttpResponse.json({ category: makeCategory() })
      )
    );
    const { result, refreshSelectedGroup } = renderCategoryManagement();

    act(() => result.current.setCategoryName("Groceries"));
    await act(async () => {
      await result.current.submitCategory({ preventDefault: () => {} } as React.FormEvent);
    });

    expect(refreshSelectedGroup).toHaveBeenCalled();
    expect(result.current.categoryName).toBe("");
  });

  it("openCategoryEditForm/closeCategoryEditForm populate and reset edit state", () => {
    const { result } = renderCategoryManagement();

    act(() => result.current.openCategoryEditForm(makeCategory({ name: "Rent" })));
    expect(result.current.editingCategoryId).toBe("cat-1");
    expect(result.current.editCategoryName).toBe("Rent");

    act(() => result.current.closeCategoryEditForm());
    expect(result.current.editingCategoryId).toBeNull();
    expect(result.current.editCategoryName).toBe("");
  });

  it("submitCategoryEdit updates the category being edited", async () => {
    let updatedBody: unknown;
    server.use(
      http.put(`${API_URL}/categories/cat-1`, async ({ request }) => {
        updatedBody = await request.json();
        return HttpResponse.json({ category: makeCategory({ name: "Rent" }) });
      })
    );
    const { result, refreshSelectedGroup } = renderCategoryManagement();

    act(() => result.current.openCategoryEditForm(makeCategory()));
    act(() => result.current.setEditCategoryName("Rent"));

    await act(async () => {
      await result.current.submitCategoryEdit({ preventDefault: () => {} } as React.FormEvent);
    });

    expect(updatedBody).toMatchObject({ name: "Rent" });
    expect(refreshSelectedGroup).toHaveBeenCalled();
    expect(result.current.editingCategoryId).toBeNull();
  });

  it("submitCategoryEdit is a no-op when nothing is being edited", async () => {
    let called = false;
    server.use(
      http.put(`${API_URL}/categories/cat-1`, () => {
        called = true;
        return HttpResponse.json({ category: makeCategory() });
      })
    );
    const { result } = renderCategoryManagement();

    await act(async () => {
      await result.current.submitCategoryEdit({ preventDefault: () => {} } as React.FormEvent);
    });

    expect(called).toBe(false);
  });

  it("confirmDeleteCategory deletes only after confirmation", async () => {
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/categories/cat-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const { result, refreshSelectedGroup } = renderCategoryManagement();

    await act(async () => {
      await result.current.confirmDeleteCategory(makeCategory());
    });

    expect(deleted).toBe(true);
    expect(refreshSelectedGroup).toHaveBeenCalled();
  });

  it("confirmDeleteCategory does not delete when the confirmation is dismissed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/categories/cat-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const { result } = renderCategoryManagement();

    await act(async () => {
      await result.current.confirmDeleteCategory(makeCategory());
    });

    expect(deleted).toBe(false);
  });

  it("archiveCategory and restoreCategory both refresh the selected group", async () => {
    server.use(
      http.post(`${API_URL}/categories/cat-1/archive`, () =>
        HttpResponse.json({ category: makeCategory({ isArchived: true }) })
      ),
      http.post(`${API_URL}/categories/cat-1/restore`, () =>
        HttpResponse.json({ category: makeCategory({ isArchived: false }) })
      )
    );
    const { result, refreshSelectedGroup } = renderCategoryManagement();

    await act(async () => {
      await result.current.archiveCategory.mutateAsync("cat-1");
    });
    expect(refreshSelectedGroup).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.restoreCategory.mutateAsync("cat-1");
    });
    expect(refreshSelectedGroup).toHaveBeenCalledTimes(2);
  });
});
