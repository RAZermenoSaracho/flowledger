import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
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

function makeRequest(
  overrides: Partial<SettlementRequest> = {}
): SettlementRequest {
  return {
    id: "sr-1",
    sharedExpenseParticipantId: "debt-1",
    debtorUserId: "user-2",
    creditorUserId: "user-1",
    amount: "50",
    status: "pending",
    debtor: {
      id: "user-2",
      username: "sam",
      nickname: null,
      displayName: "Sam"
    },
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

function baseProps(
  overrides: Partial<Parameters<typeof PendingRequestsTab>[0]> = {}
) {
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
    approvalDraftFor: () => ({
      accountAmount: "",
      accountId: "",
      categoryId: "",
      expenseOffsetCategoryId: ""
    }),
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
  it("shows loading and the error in the selected list only", () => {
    const { unmount } = renderWithProviders(
      <PendingRequestsTab {...baseProps({ isLoading: true })} />
    );
    expect(screen.getAllByText("Loading...")).toHaveLength(1);
    unmount();
    renderWithProviders(
      <PendingRequestsTab {...baseProps({ error: "Could not load debts." })} />
    );
    expect(screen.getAllByText("Could not load debts.")).toHaveLength(1);
  });

  it("shows each list's empty state in its own tab", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PendingRequestsTab {...baseProps()} />);
    expect(screen.getByText("No outgoing requests.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Awaiting my approval" }));
    expect(screen.getByText("No requests to review.")).toBeInTheDocument();
  });

  it("shows 'No requests match your search.' for a non-empty-but-filtered-out list", () => {
    renderWithProviders(
      <PendingRequestsTab
        {...baseProps({
          pendingFromMe: [makeRequest()],
          visiblePendingFromMe: []
        })}
      />
    );
    expect(
      screen.getByText("No requests match your search.")
    ).toBeInTheDocument();
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
      />,
      { route: "/?pending=forMe" }
    );
    expect(
      screen.getByRole("checkbox", { name: "Select Dinner split" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("shows 'visible of total' for the selected list when a search filters rows", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PendingRequestsTab
        {...baseProps({
          pendingFromMe: [
            makeRequest({ id: "sr-1" }),
            makeRequest({ id: "sr-3" })
          ],
          visiblePendingFromMe: [makeRequest({ id: "sr-1" })],
          pendingForMe: [makeRequest({ id: "sr-2" })],
          visiblePendingForMe: [makeRequest({ id: "sr-2" })]
        })}
      />
    );
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Awaiting my approval/ }));
    expect(screen.getByText("1 record")).toBeInTheDocument();
  });

  it("toggles the approval selection when a card's checkbox is toggled", async () => {
    const user = userEvent.setup();
    const props = baseProps({
      pendingForMe: [makeRequest()],
      visiblePendingForMe: [makeRequest()]
    });
    renderWithProviders(<PendingRequestsTab {...props} />, {
      route: "/?pending=forMe"
    });

    await user.click(
      screen.getByRole("checkbox", { name: "Select Dinner split" })
    );

    expect(props.approvalSelection.toggle).toHaveBeenCalledWith("sr-1", [
      "sr-1"
    ]);
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
    renderWithProviders(<PendingRequestsTab {...props} />, {
      route: "/?pending=forMe"
    });

    await user.click(screen.getByRole("button", { name: "Select page" }));
    expect(props.approvalSelection.setWindow).toHaveBeenCalledWith(
      ["sr-1"],
      true
    );

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
      />,
      { route: "/?pending=forMe" }
    );
    expect(
      screen.getByRole("button", { name: "Settle selected" })
    ).toBeInTheDocument();
  });

  it("disables the batch button when not every batch request's draft is complete", () => {
    const request = makeRequest();
    renderWithProviders(
      <PendingRequestsTab
        {...baseProps({
          pendingForMe: [request],
          visiblePendingForMe: [request],
          approvalDraftFor: () => ({
            accountAmount: "",
            accountId: "",
            categoryId: "",
            expenseOffsetCategoryId: ""
          })
        })}
      />,
      { route: "/?pending=forMe" }
    );
    expect(screen.getByRole("button", { name: "Settle all" })).toBeDisabled();
  });

  it("calls onRejectSettlement from a card's Reject action", async () => {
    const user = userEvent.setup();
    const props = baseProps({
      pendingForMe: [makeRequest()],
      visiblePendingForMe: [makeRequest()]
    });
    renderWithProviders(<PendingRequestsTab {...props} />, {
      route: "/?pending=forMe"
    });

    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(props.onRejectSettlement).toHaveBeenCalledWith("sr-1");
  });

  describe("sub-tabs", () => {
    const fromMe = makeRequest({
      id: "sr-out",
      sharedExpenseParticipant: {
        sharedExpense: {
          title: "Outgoing dinner",
          transaction: { type: "expense" }
        }
      } as unknown as Debt
    });
    const forMe = makeRequest({
      id: "sr-in",
      sharedExpenseParticipant: {
        sharedExpense: {
          title: "Incoming lunch",
          transaction: { type: "expense" }
        }
      } as unknown as Debt
    });
    const lists = {
      pendingFromMe: [fromMe],
      visiblePendingFromMe: [fromMe],
      pendingForMe: [forMe],
      visiblePendingForMe: [forMe]
    };

    function LocationProbe() {
      return <span data-testid="search">{useLocation().search}</span>;
    }

    it("renders only the selected list, defaulting to Requests by me", () => {
      renderWithProviders(<PendingRequestsTab {...baseProps(lists)} />);
      expect(screen.getByText("Outgoing dinner")).toBeInTheDocument();
      expect(screen.queryByText("Incoming lunch")).not.toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: /Requests by me/ })
      ).toHaveAttribute("aria-selected", "true");
    });

    it("switches tabs on click, updating pending= and keeping other params", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <PendingRequestsTab {...baseProps(lists)} />
          <LocationProbe />
        </>,
        { route: "/?tab=pending" }
      );
      await user.click(
        screen.getByRole("tab", { name: /Awaiting my approval/ })
      );
      expect(screen.getByText("Incoming lunch")).toBeInTheDocument();
      expect(screen.queryByText("Outgoing dinner")).not.toBeInTheDocument();
      expect(screen.getByTestId("search")).toHaveTextContent(
        "?tab=pending&pending=forMe"
      );
      await user.click(screen.getByRole("tab", { name: /Requests by me/ }));
      expect(screen.getByTestId("search")).toHaveTextContent(
        "?tab=pending&pending=byMe"
      );
    });

    it("honors pending= from the URL and ignores invalid values", () => {
      const { unmount } = renderWithProviders(
        <PendingRequestsTab {...baseProps(lists)} />,
        {
          route: "/?pending=forMe"
        }
      );
      expect(screen.getByText("Incoming lunch")).toBeInTheDocument();
      unmount();
      renderWithProviders(<PendingRequestsTab {...baseProps(lists)} />, {
        route: "/?pending=nope"
      });
      expect(screen.getByText("Outgoing dinner")).toBeInTheDocument();
    });

    it("opens the tab containing the highlighted settlement", () => {
      const { unmount } = renderWithProviders(
        <PendingRequestsTab
          {...baseProps({ ...lists, highlightedSettlementId: "sr-in" })}
        />
      );
      expect(screen.getByText("Incoming lunch")).toBeInTheDocument();
      unmount();
      renderWithProviders(
        <PendingRequestsTab
          {...baseProps({ ...lists, highlightedSettlementId: "sr-out" })}
        />
      );
      expect(screen.getByText("Outgoing dinner")).toBeInTheDocument();
    });

    it("shows a count badge per non-empty list", () => {
      renderWithProviders(
        <PendingRequestsTab
          {...baseProps({
            ...lists,
            pendingForMe: [forMe, makeRequest({ id: "sr-in2" })]
          })}
        />
      );
      expect(
        screen.getByRole("tab", { name: "Requests by me1" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "Awaiting my approval2" })
      ).toBeInTheDocument();
    });

    it("omits badges for empty lists", () => {
      renderWithProviders(<PendingRequestsTab {...baseProps()} />);
      expect(
        screen.getByRole("tab", { name: "Requests by me" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "Awaiting my approval" })
      ).toBeInTheDocument();
    });

    it("clears the hidden list's search filter when its tab remounts", async () => {
      const user = userEvent.setup();
      const props = baseProps(lists);
      renderWithProviders(<PendingRequestsTab {...props} />);
      vi.mocked(props.onPendingForMeQueryChange).mockClear();
      await user.click(
        screen.getByRole("tab", { name: /Awaiting my approval/ })
      );
      expect(props.onPendingForMeQueryChange).toHaveBeenCalled();
    });

    it("filters through the search box of the selected list", async () => {
      const user = userEvent.setup();
      const props = baseProps(lists);
      renderWithProviders(<PendingRequestsTab {...props} />);
      await user.type(
        screen.getByLabelText("Search requests by me"),
        "din{Enter}"
      );
      const lastQuery = vi
        .mocked(props.onPendingFromMeQueryChange)
        .mock.calls.at(-1)![0];
      expect(lastQuery.where).toBeDefined();
    });
  });
});
