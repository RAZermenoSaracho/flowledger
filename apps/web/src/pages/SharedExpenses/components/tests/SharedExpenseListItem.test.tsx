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
    owner: { id: "user-1", name: "Jane" },
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
  it("labels an expense transaction as 'Participants owe you' for the owner", () => {
    expect(
      splitDirectionLabel(
        makeSharedExpense({ transaction: { type: "expense" } as never }),
        "user-1"
      )
    ).toBe("Participants owe you");
  });

  it("labels an income transaction as 'You owe participants' for the owner", () => {
    expect(
      splitDirectionLabel(
        makeSharedExpense({ transaction: { type: "income" } as never }),
        "user-1"
      )
    ).toBe("You owe participants");
  });

  it("labels an expense transaction as 'You owe {owner}' for a participant", () => {
    expect(
      splitDirectionLabel(
        makeSharedExpense({ transaction: { type: "expense" } as never }),
        "user-2"
      )
    ).toBe("You owe Jane");
  });

  it("labels an income transaction as '{owner} owes you' for a participant", () => {
    expect(
      splitDirectionLabel(
        makeSharedExpense({ transaction: { type: "income" } as never }),
        "user-2"
      )
    ).toBe("Jane owes you");
  });

  it("falls back to a generic 'the owner' when the owner's name isn't in the response", () => {
    expect(
      splitDirectionLabel(
        makeSharedExpense({ transaction: { type: "expense" } as never, owner: undefined }),
        "user-2"
      )
    ).toBe("You owe the owner");
  });

  it("falls back to 'No debt direction' with no transaction", () => {
    expect(
      splitDirectionLabel(makeSharedExpense({ transaction: undefined }), "user-1")
    ).toBe("No debt direction");
  });

  it("switches to past tense for a settled expense, owner perspective", () => {
    expect(
      splitDirectionLabel(
        makeSharedExpense({
          status: "settled",
          transaction: { type: "expense" } as never
        }),
        "user-1"
      )
    ).toBe("Participants owed you");
  });

  it("switches to past tense for a settled income split, owner perspective", () => {
    expect(
      splitDirectionLabel(
        makeSharedExpense({
          status: "settled",
          transaction: { type: "income" } as never
        }),
        "user-1"
      )
    ).toBe("You owed participants");
  });

  it("switches to past tense for a settled expense, participant perspective", () => {
    expect(
      splitDirectionLabel(
        makeSharedExpense({
          status: "settled",
          transaction: { type: "expense" } as never
        }),
        "user-2"
      )
    ).toBe("You owed Jane");
  });

  it("switches to past tense for a settled income split, participant perspective", () => {
    expect(
      splitDirectionLabel(
        makeSharedExpense({
          status: "settled",
          transaction: { type: "income" } as never
        }),
        "user-2"
      )
    ).toBe("Jane owed you");
  });
});

describe("SharedExpenseListItem", () => {
  it("renders title, status, split direction, and total amount", () => {
    renderWithProviders(
      <SharedExpenseListItem
        sharedExpense={makeSharedExpense()}
        isHighlighted={false}
        highlightedParticipantId={null}
        currentUserId="user-1"
        canEdit={false}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText("Dinner split")).toBeInTheDocument();
    expect(screen.getByText(/open · Participants owe you/)).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
  });

  it("shows the participant's own debt direction when the viewer isn't the owner", () => {
    renderWithProviders(
      <SharedExpenseListItem
        sharedExpense={makeSharedExpense()}
        isHighlighted={false}
        highlightedParticipantId={null}
        currentUserId="user-2"
        canEdit={false}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText(/open · You owe Jane/)).toBeInTheDocument();
  });

  it("shows past-tense direction text once the shared expense is settled", () => {
    renderWithProviders(
      <SharedExpenseListItem
        sharedExpense={makeSharedExpense({ status: "settled" })}
        isHighlighted={false}
        highlightedParticipantId={null}
        currentUserId="user-1"
        canEdit={false}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText(/settled · Participants owed you/)).toBeInTheDocument();
  });

  it("renders each participant's settled/share amounts and app-vs-manual label", () => {
    renderWithProviders(
      <SharedExpenseListItem
        sharedExpense={makeSharedExpense()}
        isHighlighted={false}
        highlightedParticipantId={null}
        currentUserId="user-1"
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
        currentUserId="user-1"
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
        currentUserId="user-1"
        canEdit={false}
        onEdit={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Actions for Dinner split" })
    ).not.toBeInTheDocument();
  });
});
