import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string, item: string) {
  await user.click(await screen.findByRole("button", { name: `Actions for ${name}` }));
  await user.click(screen.getByRole("menuitem", { name: item }));
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("GroupCategoriesSection", () => {
  it("renders cards with name, type and Archived badge under the title", async () => {
    mockCategories([makeCategory(), makeCategory({ id: "cat-2", name: "Old", isArchived: true })]);
    renderSection();

    expect(await screen.findByText("Groceries")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Group categories" })).toBeInTheDocument();
    expect(screen.getAllByText("Expense")).toHaveLength(2);
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    mockCategories([]);
    renderSection();
    expect(await screen.findByText("No group categories found.")).toBeInTheDocument();
  });

  it("edits a card in place, leaving the others untouched", async () => {
    mockCategories([
      makeCategory({ id: "a", name: "Alpha" }),
      makeCategory({ id: "b", name: "Beta" }),
      makeCategory({ id: "c", name: "Gamma" })
    ]);
    let updatedBody: unknown;
    server.use(
      http.put(`${API_URL}/categories/b`, async ({ request }) => {
        updatedBody = await request.json();
        return HttpResponse.json({ category: makeCategory({ id: "b", name: "Food" }) });
      })
    );
    const user = userEvent.setup();
    renderSection();

    await openMenu(user, "Beta", "Edit");

    const name = screen.getByLabelText("Name");
    const cell = name.closest("div.rounded-md")!;
    const grid = cell.parentElement!;
    expect(grid.children[1]).toBe(cell);
    expect(within(grid.children[0] as HTMLElement).getByText("Alpha")).toBeInTheDocument();
    expect(within(grid.children[2] as HTMLElement).getByText("Gamma")).toBeInTheDocument();

    await user.clear(name);
    await user.type(name, "Food");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatedBody).toMatchObject({ name: "Food" }));
    await waitFor(() => expect(screen.queryByLabelText("Name")).not.toBeInTheDocument());
  });

  it("cancels an edit without saving", async () => {
    mockCategories([makeCategory()]);
    const user = userEvent.setup();
    renderSection();

    await openMenu(user, "Groceries", "Edit");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
  });

  it("archives an active category from the menu", async () => {
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

    await openMenu(user, "Groceries", "Archive");
    await waitFor(() => expect(archived).toBe(true));
  });

  it("restores an archived category from the menu", async () => {
    mockCategories([makeCategory({ isArchived: true })]);
    let restored = false;
    server.use(
      http.post(`${API_URL}/categories/cat-1/restore`, () => {
        restored = true;
        return HttpResponse.json({ category: makeCategory() });
      })
    );
    const user = userEvent.setup();
    renderSection();

    await openMenu(user, "Groceries", "Restore");
    await waitFor(() => expect(restored).toBe(true));
  });

  it("deletes a category after confirmation", async () => {
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

    await openMenu(user, "Groceries", "Delete");
    await waitFor(() => expect(deleted).toBe(true));
  });

  it("creates a category through the modal and closes it", async () => {
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

    await user.click(await screen.findByRole("button", { name: "Add category" }));
    const dialog = screen.getByRole("dialog", { name: "New group category" });
    await user.type(within(dialog).getByLabelText("Name"), "Rent");
    await user.click(within(dialog).getByRole("button", { name: "Add category" }));

    await waitFor(() => expect(createdBody).toMatchObject({ name: "Rent", type: "expense" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the modal open with the error and entered values when create fails", async () => {
    mockCategories([]);
    server.use(
      http.post(`${API_URL}/groups/group-1/categories`, () =>
        HttpResponse.json({ message: "Duplicate category" }, { status: 409 })
      )
    );
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Add category" }));
    const dialog = screen.getByRole("dialog", { name: "New group category" });
    await user.type(within(dialog).getByLabelText("Name"), "Rent");
    await user.click(within(dialog).getByRole("button", { name: "Add category" }));

    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Rent");
  });

  it("closes a pristine modal without confirming, and confirms before discarding input", async () => {
    mockCategories([]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Add category" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add category" }));
    await user.type(screen.getByLabelText("Name"), "Rent");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows no menu and no + for a viewer who cannot manage", async () => {
    mockCategories([makeCategory()]);
    renderSection(false);

    await screen.findByText("Groceries");
    expect(screen.queryByRole("button", { name: "Add category" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions for Groceries" })).not.toBeInTheDocument();
  });
});
