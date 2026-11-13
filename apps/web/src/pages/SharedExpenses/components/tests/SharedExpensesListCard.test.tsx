import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
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
    totalAmount: "100",
    status: "open",
    participants: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
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
        sharedExpenses={[]}
        highlightedSharedExpenseId={null}
        highlightedParticipantId={null}
        currentUserId="user-1"
      />
    );

    expect(screen.getAllByRole("button", { name: "Add shared expense" }).length).toBeGreaterThan(
      0
    );
    expect(screen.getByLabelText("Search shared expenses")).toBeInTheDocument();
  });

  it("opens a new shared transaction draft when the add button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <SharedExpensesListCard
          onQueryChange={vi.fn()}
          sharedExpenses={[]}
          highlightedSharedExpenseId={null}
          highlightedParticipantId={null}
          currentUserId="user-1"
        />
        <LocationProbe />
      </>
    );

    await user.click(screen.getAllByRole("button", { name: "Add shared expense" })[0]!);

    expect(screen.getByTestId("location")).toHaveTextContent("/transactions/new?shared=1&tab=sharing");
  });

  it("shows 'No shared expenses found.' when the list is empty", () => {
    renderWithProviders(
      <SharedExpensesListCard
        onQueryChange={vi.fn()}
        sharedExpenses={[]}
        highlightedSharedExpenseId={null}
        highlightedParticipantId={null}
        currentUserId="user-1"
      />
    );

    expect(screen.getByText("No shared expenses found.")).toBeInTheDocument();
  });

  it("renders grouped sections with headers and rows linking to the Shared Expense view", () => {
    const owned = makeSharedExpense({ id: "se-1", title: "Owned", ownerUserId: "user-1" });
    const notOwned = makeSharedExpense({ id: "se-2", title: "Not owned", ownerUserId: "user-2" });
    renderWithProviders(
      <SharedExpensesListCard
        onQueryChange={vi.fn()}
        sharedExpenses={[owned, notOwned]}
        groupedSharedExpenses={[{ key: "open", label: "open", items: [owned, notOwned] }]}
        highlightedSharedExpenseId={null}
        highlightedParticipantId={null}
        currentUserId="user-1"
      />
    );

    expect(screen.getByRole("heading", { level: 3, name: "open" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Not owned/ })).toHaveAttribute(
      "href",
      "/debts/shared-expenses/se-2"
    );
    expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it("shows loading and error states instead of the empty text", () => {
    const base = {
      onQueryChange: vi.fn(),
      sharedExpenses: [],
      highlightedSharedExpenseId: null,
      highlightedParticipantId: null,
      currentUserId: "user-1"
    };
    const { rerender } = renderWithProviders(<SharedExpensesListCard {...base} isLoading />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("No shared expenses found.")).not.toBeInTheDocument();

    rerender(<SharedExpensesListCard {...base} error="Boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  });
});
