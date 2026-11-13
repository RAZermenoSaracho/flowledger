import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { SharedExpense } from "../../../../types/sharedExpenses.types";
import { SharedExpenseListItem } from "../SharedExpenseListItem";

function makeSharedExpense(overrides: Partial<SharedExpense> = {}): SharedExpense {
  return {
    id: "se-1",
    transactionId: "tx-1",
    ownerUserId: "user-1",
    title: "Dinner split",
    totalAmount: "100",
    status: "open",
    transaction: {
      id: "tx-1",
      type: "expense",
      executionCurrency: "USD"
    } as SharedExpense["transaction"],
    owner: { id: "user-1", username: "jane", nickname: null, displayName: "Jane" },
    participants: [
      {
        id: "p-1",
        userId: "user-2",
        participantName: "Friend",
        currency: "USD",
        shareAmount: "50",
        paidAmount: "20",
        status: "partial"
      }
    ],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("SharedExpenseListItem", () => {
  it("renders title, status, split direction, and total amount", () => {
    renderWithProviders(
      <SharedExpenseListItem
        sharedExpense={makeSharedExpense()}
        isHighlighted={false}
        highlightedParticipantId={null}
        currentUserId="user-1"
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
              />
    );

    expect(screen.getByText(/open · You owe Jane \(@jane\)/)).toBeInTheDocument();
  });

  it("shows past-tense direction text once the shared expense is settled", () => {
    renderWithProviders(
      <SharedExpenseListItem
        sharedExpense={makeSharedExpense({ status: "settled" })}
        isHighlighted={false}
        highlightedParticipantId={null}
        currentUserId="user-1"
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
              />
    );

    expect(screen.getByText(/App user/)).toBeInTheDocument();
    expect(screen.getByText(/Friend/)).toBeInTheDocument();
    expect(screen.getByText(/\$20\.00 settled of \$50\.00/)).toBeInTheDocument();
  });

  it("links the card to the Shared Expense view", () => {
    renderWithProviders(
      <SharedExpenseListItem
        sharedExpense={makeSharedExpense()}
        isHighlighted={false}
        highlightedParticipantId={null}
        currentUserId="user-1"
      />
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/debts/shared-expenses/se-1");
    expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
  });
});
