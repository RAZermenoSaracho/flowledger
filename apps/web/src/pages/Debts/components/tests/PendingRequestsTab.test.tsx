import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { ListSelection } from "../../../../types/common.types";
import type { Account } from "../../../../types/accounts.types";
import type { Category } from "../../../../types/categories.types";
import type { Debt, SettlementRequest } from "../../../../types/debts.types";
import { PendingRequestsTab } from "../PendingRequestsTab";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Checking",
    type: "checking",
    currency: "USD",
    initialBalance: "0",
    isArchived: false,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function makeRequest(overrides: Partial<SettlementRequest> = {}): SettlementRequest {
  return {
    id: "sr-1",
    sharedExpenseParticipantId: "debt-1",
    debtorUserId: "user-2",
    creditorUserId: "user-1",
    amount: "50",
    status: "pending",
    debtor: { id: "user-2", username: "sam", nickname: null, displayName: "Sam" },
    sharedExpenseParticipant: {
      sharedExpense: { title: "Dinner split", transaction: { type: "expense" } }
    } as unknown as Debt,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function makeSelection(selectedIds: string[] = []): ListSelection {
  return {
    count: selectedIds.length,
    allMatching: false,
    canSelectAllMatching: false,
    isSelected: (id) => selectedIds.includes(id),
    toggle: vi.fn(),
    setWindow: vi.fn(),
    selectAllMatching: vi.fn(),
    clear: vi.fn()
  };
}

function baseProps(overrides: Partial<Parameters<typeof PendingRequestsTab>[0]> = {}) {
  return {
    pendingFromMe: [],
    pendingForMe: [],
    visiblePendingFromMe: [],
    visiblePendingForMe: [],
    onPendingFromMeQueryChange: vi.fn(),
    onPendingForMeQueryChange: vi.fn(),
    approvalSelection: makeSelection(),
    accounts: [makeAccount()],
    isActing: false,
    approvalDraftFor: () => ({ accountAmount: "", accountId: "", categoryId: "", expenseOffsetCategoryId: "" }),
    onApprovalDraftChange: vi.fn(),
    incomeCategoryOptionsFor: (): Category[] => [],
    expenseOffsetCategoryOptionsFor: (): Category[] => [],
    onApproveSettlement: vi.fn(),
    onRejectSettlement: vi.fn(),
    onSubmitBatchApproval: vi.fn(async () => {}),
    ...overrides
  };
}

describe("PendingRequestsTab", () => {
  it("shows loading in both lists, and the error in both lists", () => {
    const { unmount } = renderWithProviders(<PendingRequestsTab {...baseProps({ isLoading: true })} />);
    expect(screen.getAllByText("Loading...")).toHaveLength(2);
    unmount();
    renderWithProviders(<PendingRequestsTab {...baseProps({ error: "Could not load debts." })} />);
    expect(screen.getAllByText("Could not load debts.")).toHaveLength(2);
  });

  it("shows empty states for both columns when there's nothing pending", () => {
    renderWithProviders(<PendingRequestsTab {...baseProps()} />);
    expect(screen.getByText("No outgoing requests.")).toBeInTheDocument();
    expect(screen.getByText("No requests to review.")).toBeInTheDocument();
  });

  it("shows 'No requests match your search.' for a non-empty-but-filtered-out column", () => {
    renderWithProviders(
      <PendingRequestsTab
        {...baseProps({ pendingFromMe: [makeRequest()], visiblePendingFromMe: [] })}
      />
    );
    expect(screen.getByText("No requests match your search.")).toBeInTheDocument();
  });

  it("renders outgoing requests as plain (non-selectable) cards", () => {
    renderWithProviders(
      <PendingRequestsTab
        {...baseProps({
          pendingFromMe: [makeRequest()],
          visiblePendingFromMe: [makeRequest()]
        })}
      />
    );
    expect(screen.getByText("Dinner split")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders awaiting-approval requests with a selection checkbox with ApprovalActions", () => {
    renderWithProviders(
      <PendingRequestsTab
        {...baseProps({
          pendingForMe: [makeRequest()],
          visiblePendingForMe: [makeRequest()]
        })}
      />
    );
    expect(screen.getByRole("checkbox", { name: "Select Dinner split" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("shows 'visible of total' per list when a search filters rows", () => {
    renderWithProviders(
      <PendingRequestsTab
        {...baseProps({
          pendingFromMe: [makeRequest({ id: "sr-1" }), makeRequest({ id: "sr-3" })],
          visiblePendingFromMe: [makeRequest({ id: "sr-1" })],
          pendingForMe: [makeRequest({ id: "sr-2" })],
          visiblePendingForMe: [makeRequest({ id: "sr-2" })]
        })}
      />
    );
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("1 record")).toBeInTheDocument();
  });

  it("toggles the approval selection when a card's checkbox is toggled", async () => {
    const user = userEvent.setup();
    const props = baseProps({
      pendingForMe: [makeRequest()],
      visiblePendingForMe: [makeRequest()]
    });
    renderWithProviders(<PendingRequestsTab {...props} />);

    await user.click(screen.getByRole("checkbox", { name: "Select Dinner split" }));

    expect(props.approvalSelection.toggle).toHaveBeenCalledWith("sr-1", ["sr-1"]);
  });

  it("'Select page' and the batch-approval button wire to their callbacks", async () => {
    const user = userEvent.setup();
    const request = makeRequest();
    const props = baseProps({
      pendingForMe: [request],
      visiblePendingForMe: [request],
      approvalDraftFor: () => ({
        accountAmount: "",
        accountId: "acc-1",
        categoryId: "cat-1",
        expenseOffsetCategoryId: ""
      })
    });
    renderWithProviders(<PendingRequestsTab {...props} />);

    await user.click(screen.getByRole("button", { name: "Select page" }));
    expect(props.approvalSelection.setWindow).toHaveBeenCalledWith(["sr-1"], true);

    await user.click(screen.getByRole("button", { name: "Settle all" }));
    expect(props.onSubmitBatchApproval).toHaveBeenCalledWith([request]);
  });

  it("labels the batch button 'Settle selected' once some approvals are selected", () => {
    const request = makeRequest();
    renderWithProviders(
      <PendingRequestsTab
        {...baseProps({
          pendingForMe: [request],
          visiblePendingForMe: [request],
          approvalSelection: makeSelection(["sr-1"])
        })}
      />
    );
    expect(screen.getByRole("button", { name: "Settle selected" })).toBeInTheDocument();
  });

  it("disables the batch button when not every batch request's draft is complete", () => {
    const request = makeRequest();
    renderWithProviders(
      <PendingRequestsTab
        {...baseProps({
          pendingForMe: [request],
          visiblePendingForMe: [request],
          approvalDraftFor: () => ({ accountAmount: "", accountId: "", categoryId: "", expenseOffsetCategoryId: "" })
        })}
      />
    );
    expect(screen.getByRole("button", { name: "Settle all" })).toBeDisabled();
  });

  it("calls onRejectSettlement from a card's Reject action", async () => {
    const user = userEvent.setup();
    const props = baseProps({
      pendingForMe: [makeRequest()],
      visiblePendingForMe: [makeRequest()]
    });
    renderWithProviders(<PendingRequestsTab {...props} />);

    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(props.onRejectSettlement).toHaveBeenCalledWith("sr-1");
  });
});
