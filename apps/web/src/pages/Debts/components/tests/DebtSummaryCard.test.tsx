import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Debt } from "../../../../types/debts.types";
import { DebtSummaryCard } from "../DebtSummaryCard";

function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-1",
    userId: "user-2",
    participantName: "Friend",
    currency: "USD",
    shareAmount: 100,
    paidAmount: 40,
    status: "partial",
    sharedExpenseId: "se-1",
    debtorUserId: "user-2",
    creditorUserId: "user-1",
    outstandingAmount: 60,
    pendingSettlementAmount: 0,
    sharedExpense: {
      id: "se-1",
      transactionId: "tx-1",
      ownerUserId: "user-1",
      title: "Dinner split",
      totalAmount: 100,
      status: "open",
      owner: { id: "user-1", name: "Jane", email: "jane@example.com" },
      transaction: { type: "expense" } as Debt["sharedExpense"]["transaction"],
      participants: [],
      createdAt: "",
      updatedAt: ""
    },
    user: { id: "user-2", name: "Sam", email: "sam@example.com" },
    settlementRequests: [],
    ...overrides
  };
}

describe("DebtSummaryCard", () => {
  it("renders the debt's title, description, outstanding amount, and status", () => {
    renderWithProviders(<DebtSummaryCard debt={makeDebt()} viewerUserId="user-2" />);

    expect(screen.getByText("Dinner split")).toBeInTheDocument();
    expect(screen.getByText(/Jane · expense split · \$40\.00 settled of \$100\.00/)).toBeInTheDocument();
    expect(screen.getByText("$60.00")).toBeInTheDocument();
    expect(screen.getByText("partial")).toBeInTheDocument();
  });

  it("applies highlight styling when isHighlighted is true", () => {
    renderWithProviders(<DebtSummaryCard debt={makeDebt()} isHighlighted />);
    expect(document.getElementById("debt-debt-1")).toHaveClass("border-pine");
  });

  it("shows 'settled' status once outstandingAmount is 0", () => {
    renderWithProviders(<DebtSummaryCard debt={makeDebt({ outstandingAmount: 0 })} />);
    expect(screen.getByText("settled")).toBeInTheDocument();
  });
});
