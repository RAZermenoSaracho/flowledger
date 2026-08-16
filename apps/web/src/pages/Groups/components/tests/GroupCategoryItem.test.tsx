import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Category } from "../../../../types/categories.types";
import { useGroupCategoryManagement } from "../../hooks/useGroupCategoryManagement";
import { GroupCategoryItem } from "../GroupCategoryItem";

const API_URL = "http://localhost:4000";

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

function Harness({ category, canManage }: { category: Category; canManage: boolean }) {
  const categoryManagement = useGroupCategoryManagement({
    selectedGroupId: "group-1",
    refreshSelectedGroup: async () => {}
  });
  return (
    <GroupCategoryItem
      category={category}
      canManage={canManage}
      categoryManagement={categoryManagement}
    />
  );
}

function renderItem(category: Category, canManage = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness category={category} canManage={canManage} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("GroupCategoryItem", () => {
  it("renders the category name and type", () => {
    renderItem(makeCategory());
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Expense")).toBeInTheDocument();
  });

  it("omits the actions menu when canManage is false", () => {
    renderItem(makeCategory(), false);
    expect(screen.queryByRole("button", { name: "Actions for Groceries" })).not.toBeInTheDocument();
  });

  it("opens the edit form and saves changes", async () => {
    let updatedBody: unknown;
    server.use(
      http.put(`${API_URL}/categories/cat-1`, async ({ request }) => {
        updatedBody = await request.json();
        return HttpResponse.json({ category: makeCategory({ name: "Food" }) });
      })
    );
    const user = userEvent.setup();
    renderItem(makeCategory());

    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Food");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatedBody).toMatchObject({ name: "Food" }));
  });

  it("archives an active category from its menu", async () => {
    let archived = false;
    server.use(
      http.post(`${API_URL}/categories/cat-1/archive`, () => {
        archived = true;
        return HttpResponse.json({ category: makeCategory({ isArchived: true }) });
      })
    );
    const user = userEvent.setup();
    renderItem(makeCategory());

    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));

    await waitFor(() => expect(archived).toBe(true));
  });

  it("shows a Restore action and archived badge for an archived category", async () => {
    const user = userEvent.setup();
    renderItem(makeCategory({ isArchived: true }));

    expect(screen.getByText("Archived")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    expect(screen.getByRole("menuitem", { name: "Restore" })).toBeInTheDocument();
  });

  it("deletes the category after confirmation", async () => {
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/categories/cat-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderItem(makeCategory());

    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    await waitFor(() => expect(deleted).toBe(true));
  });
});
