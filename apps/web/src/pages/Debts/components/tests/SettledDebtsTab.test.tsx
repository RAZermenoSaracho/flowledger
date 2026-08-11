import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Debt } from "../../../../types/debts.types";
import { SettledDebtsTab } from "../SettledDebtsTab";

function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-1",
    userId: "user-2",
    participantName: "Friend",
    currency: "USD",
    shareAmount: 100,
    paidAmount: 100,
    status: "paid",
    sharedExpenseId: "se-1",
    debtorUserId: "user-2",
    creditorUserId: "user-1",
    outstandingAmount: 0,
    pendingSettlementAmount: 0,
    sharedExpense: {
      id: "se-1",
      transactionId: "tx-1",
      ownerUserId: "user-1",
      title: "Dinner split",
      totalAmount: 100,
      status: "settled",
      participants: [],
      createdAt: "",
      updatedAt: ""
    },
    settlementRequests: [],
    ...overrides
  };
}

describe("SettledDebtsTab", () => {
  it("shows 'No settled debts yet.' when the underlying list is empty", () => {
    renderWithProviders(
      <SettledDebtsTab
        settledDebts={[]}
        visibleSettledDebts={[]}
        onSettledQueryChange={vi.fn()}
      />
    );
    expect(screen.getByText("No settled debts yet.")).toBeInTheDocument();
  });

  it("shows 'No settled debts match your search.' when search narrows to nothing", () => {
    renderWithProviders(
      <SettledDebtsTab
        settledDebts={[makeDebt()]}
        visibleSettledDebts={[]}
        onSettledQueryChange={vi.fn()}
      />
    );
    expect(screen.getByText("No settled debts match your search.")).toBeInTheDocument();
  });

  it("renders visible debts and the 'N of M' count", () => {
    renderWithProviders(
      <SettledDebtsTab
        settledDebts={[makeDebt(), makeDebt({ id: "debt-2" })]}
        visibleSettledDebts={[makeDebt()]}
        onSettledQueryChange={vi.fn()}
      />
    );

    expect(screen.getByText("Dinner split")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("highlights the debt matching highlightedDebtId", () => {
    renderWithProviders(
      <SettledDebtsTab
        settledDebts={[makeDebt()]}
        visibleSettledDebts={[makeDebt()]}
        onSettledQueryChange={vi.fn()}
        highlightedDebtId="debt-1"
      />
    );
    expect(document.getElementById("debt-debt-1")).toHaveClass("border-pine");
  });
});
