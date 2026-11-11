import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Category } from "../../../../types/categories.types";
import { useGroupCategoryManagement } from "../../hooks/useGroupCategoryManagement";
import { GroupCategoriesSection } from "../GroupCategoriesSection";

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

function Harness({ canManageActive }: { canManageActive: boolean }) {
  const categoryManagement = useGroupCategoryManagement({
    selectedGroupId: "group-1",
    refreshSelectedGroup: async () => {}
  });
  return (
    <GroupCategoriesSection
      groupId="group-1"
      canManage={canManageActive}
      canManageActive={canManageActive}
      categoryManagement={categoryManagement}
    />
  );
}

function renderSection(canManageActive = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness canManageActive={canManageActive} />
    </QueryClientProvider>
  );
}

function mockCategories(categories: Category[]) {
  server.use(http.get(`${API_URL}/categories`, () => HttpResponse.json({ categories })));
}

describe("GroupCategoriesSection", () => {
  it("lists the group's categories", async () => {
    mockCategories([makeCategory()]);
    renderSection();

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
  });

  it("shows 'No group categories found.' when the list is empty", async () => {
    mockCategories([]);
    renderSection();

    await waitFor(() =>
      expect(screen.getByText("No group categories found.")).toBeInTheDocument()
    );
  });

  it("shows the add-category form only when canManageActive is true", async () => {
    mockCategories([]);
    renderSection(false);

    await waitFor(() =>
      expect(screen.getByText("No group categories found.")).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: "Add category" })).not.toBeInTheDocument();
  });

  it("adds a category via the inline form", async () => {
    mockCategories([]);
    let createdBody: unknown;
    server.use(
      http.post(`${API_URL}/groups/group-1/categories`, async ({ request }) => {
        createdBody = await request.json();
        return HttpResponse.json({ category: makeCategory({ name: "Rent" }) });
      })
    );
    const user = userEvent.setup();
    renderSection();

    await waitFor(() =>
      expect(screen.getByText("No group categories found.")).toBeInTheDocument()
    );
    await user.type(screen.getByLabelText("Category"), "Rent");
    await user.click(screen.getByRole("button", { name: "Add category" }));

    await waitFor(() => expect(createdBody).toMatchObject({ name: "Rent" }));
  });

  it("edits a category through the inline form", async () => {
    mockCategories([makeCategory()]);
    let updatedBody: unknown;
    server.use(
      http.put(`${API_URL}/categories/cat-1`, async ({ request }) => {
        updatedBody = await request.json();
        return HttpResponse.json({ category: makeCategory({ name: "Food" }) });
      })
    );
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Edit Groceries" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Food");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatedBody).toMatchObject({ name: "Food" }));
  });

  it("archives an active category", async () => {
    mockCategories([makeCategory()]);
    let archived = false;
    server.use(
      http.post(`${API_URL}/categories/cat-1/archive`, () => {
        archived = true;
        return HttpResponse.json({ category: makeCategory({ isArchived: true }) });
      })
    );
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Archive Groceries" }));

    await waitFor(() => expect(archived).toBe(true));
  });

  it("shows Restore and an Archived badge for an archived category", async () => {
    mockCategories([makeCategory({ isArchived: true })]);
    renderSection();

    expect(await screen.findByRole("button", { name: "Restore Groceries" })).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("deletes a category after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockCategories([makeCategory()]);
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/categories/cat-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Delete Groceries" }));

    await waitFor(() => expect(deleted).toBe(true));
  });

  it("hides row actions when the viewer cannot manage", async () => {
    mockCategories([makeCategory()]);
    renderSection(false);

    await screen.findByText("Groceries");
    expect(screen.queryByRole("button", { name: "Edit Groceries" })).not.toBeInTheDocument();
  });
});
