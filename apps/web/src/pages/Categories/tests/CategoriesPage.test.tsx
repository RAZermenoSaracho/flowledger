import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import type { Category } from "../../../types/categories.types";
import { CategoriesPage } from "../CategoriesPage";

const API_URL = "http://localhost:4000";

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    name: "Groceries",
    type: "expense",
    color: "#176b52",
    isArchived: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function mockCategories(categories: Category[]) {
  server.use(http.get(`${API_URL}/categories`, () => HttpResponse.json({ categories })));
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("CategoriesPage", () => {
  it("renders the category list", async () => {
    mockCategories([makeCategory()]);
    renderWithProviders(<CategoriesPage />);

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    expect(screen.getByText("expense")).toBeInTheDocument();
  });

  it("shows 'No categories found.' when the list is empty", async () => {
    mockCategories([]);
    renderWithProviders(<CategoriesPage />);

    await waitFor(() => expect(screen.getByText("No categories found.")).toBeInTheDocument());
  });

  it("marks an archived category with a badge", async () => {
    mockCategories([makeCategory({ isArchived: true })]);
    renderWithProviders(<CategoriesPage />);

    await waitFor(() => expect(screen.getByText("Archived")).toBeInTheDocument());
  });

  it("opens the create form and creates a category", async () => {
    mockCategories([]);
    let createdBody: unknown;
    server.use(
      http.post(`${API_URL}/categories`, async ({ request }) => {
        createdBody = await request.json();
        return HttpResponse.json({ category: makeCategory({ name: "Rent" }) });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<CategoriesPage />);

    await waitFor(() => expect(screen.getByText("No categories found.")).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: "Add category" })[0]!);
    await user.type(screen.getByLabelText("Name"), "Rent");
    await user.click(screen.getByRole("button", { name: "Save category" }));

    await waitFor(() => expect(screen.queryByText("New category")).not.toBeInTheDocument());
    expect(createdBody).toMatchObject({ name: "Rent", type: "expense" });
  });

  it("cancels the create form without submitting", async () => {
    mockCategories([]);
    const user = userEvent.setup();
    renderWithProviders(<CategoriesPage />);

    await waitFor(() => expect(screen.getByText("No categories found.")).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: "Add category" })[0]!);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("New category")).not.toBeInTheDocument();
  });

  it("opens the edit form for a category and saves changes", async () => {
    mockCategories([makeCategory()]);
    let updatedBody: unknown;
    server.use(
      http.put(`${API_URL}/categories/cat-1`, async ({ request }) => {
        updatedBody = await request.json();
        return HttpResponse.json({ category: makeCategory({ name: "Food" }) });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<CategoriesPage />);

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    const editNameInput = screen.getByLabelText("Name");
    await user.clear(editNameInput);
    await user.type(editNameInput, "Food");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatedBody).toMatchObject({ name: "Food" }));
  });

  it("archives an active category and restores an archived one", async () => {
    mockCategories([makeCategory()]);
    let archived = false;
    server.use(
      http.post(`${API_URL}/categories/cat-1/archive`, () => {
        archived = true;
        return HttpResponse.json({ category: makeCategory({ isArchived: true }) });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<CategoriesPage />);

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));

    await waitFor(() => expect(archived).toBe(true));
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
    renderWithProviders(<CategoriesPage />);

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    await waitFor(() => expect(deleted).toBe(true));
  });

  it("does not delete when the confirmation dialog is dismissed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockCategories([makeCategory()]);
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/categories/cat-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<CategoriesPage />);

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(deleted).toBe(false);
  });

  it("groups categories by type when 'Group by Type' is active", async () => {
    mockCategories([
      makeCategory({ id: "c1", name: "Groceries", type: "expense" }),
      makeCategory({ id: "c2", name: "Paycheck", type: "income" })
    ]);
    const user = userEvent.setup();
    renderWithProviders(<CategoriesPage />);

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Filter, group, and sort" }));
    await user.click(screen.getByLabelText("Type"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 3, name: "expense" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 3, name: "income" })).toBeInTheDocument();
    });
  });
});
