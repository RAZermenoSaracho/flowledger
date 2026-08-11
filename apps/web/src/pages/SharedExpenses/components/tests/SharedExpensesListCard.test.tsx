import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { SharedExpense } from "../../../../types/sharedExpenses.types";
import {
  sharedExpenseGroupKey,
  SharedExpensesListCard
} from "../SharedExpensesListCard";

function makeSharedExpense(overrides: Partial<SharedExpense> = {}): SharedExpense {
  return {
    id: "se-1",
    transactionId: "tx-1",
    ownerUserId: "user-1",
    title: "Dinner split",
    totalAmount: 100,
    status: "open",
    participants: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("sharedExpenseGroupKey", () => {
  it("groups by status", () => {
    expect(sharedExpenseGroupKey(makeSharedExpense({ status: "settled" }), "status")).toEqual({
      key: "settled",
      label: "settled"
    });
  });

  it("returns an empty key/label for an unrecognized group-by id", () => {
    expect(sharedExpenseGroupKey(makeSharedExpense(), "unknown")).toEqual({ key: "", label: "" });
  });
});

describe("SharedExpensesListCard", () => {
  it("renders the AddRecordButton and search bar", () => {
    renderWithProviders(
      <SharedExpensesListCard
        onQueryChange={vi.fn()}
        onAddSharedExpense={vi.fn()}
        groupedSharedExpenses={[]}
        visibleCount={0}
        highlightedSharedExpenseId={null}
        highlightedParticipantId={null}
        currentUserId="user-1"
        onEdit={vi.fn()}
      />
    );

    expect(screen.getAllByRole("button", { name: "Add shared expense" }).length).toBeGreaterThan(
      0
    );
    expect(screen.getByLabelText("Search shared expenses")).toBeInTheDocument();
  });

  it("calls onAddSharedExpense when the add button is clicked", async () => {
    const user = userEvent.setup();
    const onAddSharedExpense = vi.fn();
    renderWithProviders(
      <SharedExpensesListCard
        onQueryChange={vi.fn()}
        onAddSharedExpense={onAddSharedExpense}
        groupedSharedExpenses={[]}
        visibleCount={0}
        highlightedSharedExpenseId={null}
        highlightedParticipantId={null}
        currentUserId="user-1"
        onEdit={vi.fn()}
      />
    );

    await user.click(screen.getAllByRole("button", { name: "Add shared expense" })[0]!);

    expect(onAddSharedExpense).toHaveBeenCalledOnce();
  });

  it("shows 'No shared expenses found.' when visibleCount is 0", () => {
    renderWithProviders(
      <SharedExpensesListCard
        onQueryChange={vi.fn()}
        onAddSharedExpense={vi.fn()}
        groupedSharedExpenses={[]}
        visibleCount={0}
        highlightedSharedExpenseId={null}
        highlightedParticipantId={null}
        currentUserId="user-1"
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText("No shared expenses found.")).toBeInTheDocument();
  });

  it("renders grouped sections with headers and list items, gating edit access by ownerUserId", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    const owned = makeSharedExpense({ id: "se-1", title: "Owned", ownerUserId: "user-1" });
    const notOwned = makeSharedExpense({ id: "se-2", title: "Not owned", ownerUserId: "user-2" });
    renderWithProviders(
      <SharedExpensesListCard
        onQueryChange={vi.fn()}
        onAddSharedExpense={vi.fn()}
        groupedSharedExpenses={[{ key: "open", label: "open", items: [owned, notOwned] }]}
        visibleCount={2}
        highlightedSharedExpenseId={null}
        highlightedParticipantId={null}
        currentUserId="user-1"
        onEdit={onEdit}
      />
    );

    expect(screen.getByRole("heading", { level: 3, name: "open" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions for Owned" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions for Not owned" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actions for Owned" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(onEdit).toHaveBeenCalledWith(owned);
  });
});
