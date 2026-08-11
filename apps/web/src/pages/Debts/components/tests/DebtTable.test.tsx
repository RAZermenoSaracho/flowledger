import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Debt } from "../../../../types/debts.types";
import { DebtTable } from "../DebtTable";

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
      participants: [],
      createdAt: "",
      updatedAt: ""
    },
    settlementRequests: [],
    ...overrides
  };
}

function baseProps(overrides: Partial<Parameters<typeof DebtTable>[0]> = {}) {
  return {
    title: "They Owe Me",
    debts: [makeDebt()],
    selectedDebtIds: new Set<string>(),
    emptyText: "Nothing here.",
    onToggleDebt: vi.fn(),
    onSelectDebts: vi.fn(),
    ...overrides
  };
}

describe("DebtTable", () => {
  it("renders the title and each debt's title/amount/status", () => {
    renderWithProviders(<DebtTable {...baseProps()} />);
    expect(screen.getByText("They Owe Me")).toBeInTheDocument();
    expect(screen.getByText("Dinner split")).toBeInTheDocument();
    expect(screen.getByText("$60.00")).toBeInTheDocument();
    expect(screen.getByText("partial")).toBeInTheDocument();
  });

  it("shows emptyText when there are no debts", () => {
    renderWithProviders(<DebtTable {...baseProps({ debts: [] })} />);
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });

  it("calls onToggleDebt when a row's checkbox is clicked", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<DebtTable {...props} />);

    await user.click(screen.getByRole("checkbox", { name: "Select Dinner split" }));

    expect(props.onToggleDebt).toHaveBeenCalledWith("debt-1");
  });

  it("disables a debt's checkbox when it isn't in selectableDebts", () => {
    renderWithProviders(<DebtTable {...baseProps({ selectableDebts: [] })} />);
    expect(screen.getByRole("checkbox", { name: "Select Dinner split" })).toBeDisabled();
  });

  it("shows 'Select All' when not all selectable debts are selected, toggling to select them", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<DebtTable {...props} />);

    const selectAllButton = screen.getByRole("button", { name: "Select All" });
    await user.click(selectAllButton);

    expect(props.onSelectDebts).toHaveBeenCalledWith([makeDebt()], true);
  });

  it("shows 'Clear Selection' and clears when all selectable debts are already selected", async () => {
    const user = userEvent.setup();
    const props = baseProps({ selectedDebtIds: new Set(["debt-1"]) });
    renderWithProviders(<DebtTable {...props} />);

    const clearButton = screen.getByRole("button", { name: "Clear Selection" });
    await user.click(clearButton);

    expect(props.onSelectDebts).toHaveBeenCalledWith([makeDebt()], false);
  });

  it("disables 'Select All' when there are no selectable debts", () => {
    renderWithProviders(<DebtTable {...baseProps({ selectableDebts: [] })} />);
    expect(screen.getByRole("button", { name: "Select All" })).toBeDisabled();
  });

  it("highlights the row matching highlightedDebtId", () => {
    renderWithProviders(<DebtTable {...baseProps({ highlightedDebtId: "debt-1" })} />);
    expect(document.getElementById("debt-debt-1")).toHaveClass("border-pine");
  });

  it("renders a Settlement column and per-row action only when renderAction is provided", () => {
    renderWithProviders(
      <DebtTable {...baseProps({ renderAction: () => <button>Request settlement</button> })} />
    );
    expect(screen.getAllByText("Settlement").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Request settlement" })).toBeInTheDocument();
  });

  it("omits the Settlement column when renderAction is not provided", () => {
    renderWithProviders(<DebtTable {...baseProps()} />);
    expect(screen.queryByText("Settlement")).not.toBeInTheDocument();
  });
});
