import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Debt, SettlementRequest } from "../../../../types/debts.types";
import { SettlementRequestCard } from "../SettlementRequestCard";

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

function makeRequest(overrides: Partial<SettlementRequest> = {}): SettlementRequest {
  return {
    id: "sr-1",
    sharedExpenseParticipantId: "debt-1",
    debtorUserId: "user-2",
    creditorUserId: "user-1",
    amount: 50,
    status: "pending",
    debtor: { id: "user-2", name: "Sam", email: "sam@example.com" },
    sharedExpenseParticipant: makeDebt(),
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

describe("SettlementRequestCard", () => {
  it("renders the linked debt's title, requester, and amount", () => {
    renderWithProviders(<SettlementRequestCard request={makeRequest()} />);
    expect(screen.getByText("Dinner split")).toBeInTheDocument();
    expect(screen.getByText(/Sam requested \$50\.00/)).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("falls back to 'Settlement request'/'Debtor' when there's no linked debt/debtor", () => {
    renderWithProviders(
      <SettlementRequestCard
        request={makeRequest({ sharedExpenseParticipant: undefined, debtor: undefined })}
      />
    );
    expect(screen.getByText("Settlement request")).toBeInTheDocument();
    expect(screen.getByText(/Debtor requested/)).toBeInTheDocument();
  });

  it("shows the note when present", () => {
    renderWithProviders(<SettlementRequestCard request={makeRequest({ note: "Venmo sent" })} />);
    expect(screen.getByText("Venmo sent")).toBeInTheDocument();
  });

  it("applies highlight styling when isHighlighted", () => {
    renderWithProviders(<SettlementRequestCard request={makeRequest()} isHighlighted />);
    expect(document.getElementById("settlement-sr-1")).toHaveClass("border-pine");
  });

  it("renders a selection checkbox when selectable, calling onSelectedChange", async () => {
    const user = userEvent.setup();
    const onSelectedChange = vi.fn();
    renderWithProviders(
      <SettlementRequestCard
        request={makeRequest()}
        selectable
        isSelected={false}
        onSelectedChange={onSelectedChange}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: "Select Dinner split" });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(onSelectedChange).toHaveBeenCalledOnce();
  });

  it("omits the checkbox when not selectable", () => {
    renderWithProviders(<SettlementRequestCard request={makeRequest()} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders provided actions", () => {
    renderWithProviders(
      <SettlementRequestCard request={makeRequest()} actions={<button>Approve</button>} />
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });
});
