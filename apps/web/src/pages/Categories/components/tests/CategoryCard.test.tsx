import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Category } from "../../../../types/categories.types";
import { CategoryCard } from "../CategoryCard";

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

function makeActions() {
  return { onEdit: vi.fn(), onArchive: vi.fn(), onRestore: vi.fn(), onDelete: vi.fn() };
}

describe("CategoryCard", () => {
  it("renders name, type and an Archived badge", () => {
    render(<CategoryCard category={makeCategory({ isArchived: true })} />);
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Expense")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("has no actions menu without actions", () => {
    render(<CategoryCard category={makeCategory()} />);
    expect(screen.queryByRole("button", { name: "Actions for Groceries" })).not.toBeInTheDocument();
  });

  it("routes menu items to the matching handlers", async () => {
    const actions = makeActions();
    const user = userEvent.setup();
    render(<CategoryCard category={makeCategory()} actions={actions} />);

    for (const [name, handler] of [
      ["Edit", actions.onEdit],
      ["Archive", actions.onArchive],
      ["Delete", actions.onDelete]
    ] as const) {
      await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
      await user.click(screen.getByRole("menuitem", { name }));
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });

  it("offers Restore instead of Archive for an archived category", async () => {
    const actions = makeActions();
    const user = userEvent.setup();
    render(<CategoryCard category={makeCategory({ isArchived: true })} actions={actions} />);

    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    expect(screen.queryByRole("menuitem", { name: "Archive" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Restore" }));
    expect(actions.onRestore).toHaveBeenCalled();
  });

  it("renders the edit form in place and wires Save and Cancel", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onCancelEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <CategoryCard category={makeCategory()} isEditing onSave={onSave} onCancelEdit={onCancelEdit} />
    );

    expect(screen.getByLabelText("Name")).toHaveValue("Groceries");
    await user.type(screen.getByLabelText("Name"), "!");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith({ name: "Groceries!", type: "expense", color: "#176b52" });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelEdit).toHaveBeenCalled();
  });
});
