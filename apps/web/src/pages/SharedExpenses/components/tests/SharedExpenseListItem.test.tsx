import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { SharedExpense } from "../../../../types/sharedExpenses.types";
import { SharedExpenseListItem, splitDirectionLabel } from "../SharedExpenseListItem";

function makeSharedExpense(overrides: Partial<SharedExpense> = {}): SharedExpense {
  return {
    id: "se-1",
    transactionId: "tx-1",
    ownerUserId: "user-1",
    title: "Dinner split",
    totalAmount: 100,
    status: "open",
    transaction: {
      id: "tx-1",
      type: "expense",
      executionCurrency: "USD"
    } as SharedExpense["transaction"],
    participants: [
      {
        id: "p-1",
        userId: "user-2",
        participantName: "Friend",
        currency: "USD",
        shareAmount: 50,
        paidAmount: 20,
        status: "partial"
      }
    ],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("splitDirectionLabel", () => {
  it("labels an expense transaction as 'Participants owe you'", () => {
    expect(
      splitDirectionLabel(makeSharedExpense({ transaction: { type: "expense" } as never }))
    ).toBe("Participants owe you");
  });

  it("labels an income transaction as 'You owe participants'", () => {
    expect(
      splitDirectionLabel(makeSharedExpense({ transaction: { type: "income" } as never }))
    ).toBe("You owe participants");
  });

  it("falls back to 'No debt direction' with no transaction", () => {
    expect(splitDirectionLabel(makeSharedExpense({ transaction: undefined }))).toBe(
      "No debt direction"
    );
  });
});

describe("SharedExpenseListItem", () => {
  it("renders title, status, split direction, and total amount", () => {
    renderWithProviders(
      <SharedExpenseListItem
        sharedExpense={makeSharedExpense()}
        isHighlighted={false}
        highlightedParticipantId={null}
        canEdit={false}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText("Dinner split")).toBeInTheDocument();
    expect(screen.getByText(/open · Participants owe you/)).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
  });

  it("renders each participant's settled/share amounts and app-vs-manual label", () => {
    renderWithProviders(
      <SharedExpenseListItem
        sharedExpense={makeSharedExpense()}
        isHighlighted={false}
        highlightedParticipantId={null}
        canEdit={false}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText(/App user/)).toBeInTheDocument();
    expect(screen.getByText(/Friend/)).toBeInTheDocument();
    expect(screen.getByText(/\$20\.00 settled of \$50\.00/)).toBeInTheDocument();
  });

  it("shows an Edit action only when canEdit is true", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <SharedExpenseListItem
        sharedExpense={makeSharedExpense()}
        isHighlighted={false}
        highlightedParticipantId={null}
        canEdit
        onEdit={onEdit}
      />
    );

    await user.click(screen.getByRole("button", { name: "Actions for Dinner split" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("omits the actions menu when canEdit is false", () => {
    renderWithProviders(
      <SharedExpenseListItem
        sharedExpense={makeSharedExpense()}
        isHighlighted={false}
        highlightedParticipantId={null}
        canEdit={false}
        onEdit={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Actions for Dinner split" })
    ).not.toBeInTheDocument();
  });
});
