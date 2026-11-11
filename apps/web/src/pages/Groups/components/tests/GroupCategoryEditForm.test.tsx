import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Category } from "../../../../types/categories.types";
import { useGroupCategoryManagement } from "../../hooks/useGroupCategoryManagement";
import { GroupCategoryEditForm } from "../GroupCategoryEditForm";

const category: Category = {
  id: "cat-1",
  groupId: "group-1",
  name: "Groceries",
  type: "expense",
  color: "#176b52",
  isArchived: false,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

function Harness() {
  const categoryManagement = useGroupCategoryManagement({
    selectedGroupId: "group-1",
    refreshSelectedGroup: async () => {}
  });
  return (
    <>
      <button type="button" onClick={() => categoryManagement.openCategoryEditForm(category)}>
        open
      </button>
      <GroupCategoryEditForm categoryManagement={categoryManagement} />
    </>
  );
}

describe("GroupCategoryEditForm", () => {
  it("shows the category being edited and clears it on Cancel", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness />
      </QueryClientProvider>
    );

    await user.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Groceries");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });
});
