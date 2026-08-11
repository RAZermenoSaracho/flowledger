import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Account } from "../../../../types/accounts.types";
import type { Category } from "../../../../types/categories.types";
import type { Debt, PersonBalance } from "../../../../types/debts.types";
import { PersonDebtDetail } from "../PersonDebtDetail";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Checking",
    type: "checking",
    currency: "USD",
    initialBalance: 0,
    isArchived: false,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    name: "General",
    type: "expense",
    isArchived: false,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

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

function makeBalance(overrides: Partial<PersonBalance> = {}): PersonBalance {
  return {
    key: "user-2",
    person: { id: "user-2", name: "Sam", email: "sam@example.com" },
    fallbackName: "Sam",
    theyOweMe: [makeDebt()],
    iOweThem: [],
    theyOweMeTotal: 60,
    iOweThemTotal: 0,
    netBalance: 60,
    ...overrides
  };
}

function baseProps(overrides: Partial<Parameters<typeof PersonDebtDetail>[0]> = {}) {
  return {
    balance: makeBalance(),
    summaryCurrency: "USD",
    selectedDebtIds: new Set<string>(),
    selectedIOweThem: [],
    accounts: [makeAccount()],
    isActing: false,
    draftFor: (debt: Debt) => ({
      amount: String(debt.outstandingAmount),
      accountId: "acc-1",
      categoryId: "cat-1",
      note: "",
      paymentInfo: ""
    }),
    isSettlementDraftComplete: () => true,
    updateDraft: vi.fn(),
    categoryOptionsFor: () => [makeCategory()],
    onToggleDebt: vi.fn(),
    onSelectDebts: vi.fn(),
    onSubmitSettlement: vi.fn(async () => {}),
    onSubmitBatchSettlement: vi.fn(async () => {}),
    ...overrides
  };
}

describe("PersonDebtDetail", () => {
  it("renders the person's name, net balance, and they-owe-me/I-owe-them totals", () => {
    renderWithProviders(<PersonDebtDetail {...baseProps()} />);
    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getByText("Net balance $60.00")).toBeInTheDocument();
    expect(screen.getByText("They Owe Me")).toBeInTheDocument();
    expect(screen.getByText("I Owe Them")).toBeInTheDocument();
  });

  it("shows the batch-settlement selected count and total", () => {
    const debt = makeDebt();
    renderWithProviders(
      <PersonDebtDetail
        {...baseProps({
          balance: makeBalance({ iOweThem: [debt], theyOweMe: [] }),
          selectedIOweThem: [debt]
        })}
      />
    );
    expect(screen.getByText("1 selected · $60.00")).toBeInTheDocument();
  });

  it("shows a validation message when a selected debt's draft is incomplete", () => {
    const debt = makeDebt();
    renderWithProviders(
      <PersonDebtDetail
        {...baseProps({
          balance: makeBalance({ iOweThem: [debt], theyOweMe: [] }),
          selectedIOweThem: [debt],
          isSettlementDraftComplete: () => false
        })}
      />
    );
    expect(
      screen.getByText(
        "Complete amount, account, and category for every selected debt before requesting settlement."
      )
    ).toBeInTheDocument();
  });

  it("shows a per-debt settlement request form for an I-owe-them debt with available amount", async () => {
    const debt = makeDebt();
    const user = userEvent.setup();
    const props = baseProps({ balance: makeBalance({ iOweThem: [debt], theyOweMe: [] }) });
    renderWithProviders(<PersonDebtDetail {...props} />);

    expect(screen.getByLabelText("Amount (USD)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request settlement" }));

    expect(props.onSubmitSettlement).toHaveBeenCalled();
  });

  it("shows a waiting-for-approval message instead of the form when there's no available amount", () => {
    const debt = makeDebt({ outstandingAmount: 60, pendingSettlementAmount: 60 });
    renderWithProviders(
      <PersonDebtDetail {...baseProps({ balance: makeBalance({ iOweThem: [debt], theyOweMe: [] }) })} />
    );
    expect(
      screen.getByText("A settlement request is waiting for approval.")
    ).toBeInTheDocument();
  });

  it("'Select All' selects only debts with available settlement amount", async () => {
    const availableDebt = makeDebt({ id: "debt-1" });
    const waitingDebt = makeDebt({
      id: "debt-2",
      outstandingAmount: 60,
      pendingSettlementAmount: 60
    });
    const user = userEvent.setup();
    const props = baseProps({
      balance: makeBalance({ iOweThem: [availableDebt, waitingDebt], theyOweMe: [] })
    });
    renderWithProviders(<PersonDebtDetail {...props} />);

    // Three "Select All" buttons exist: DebtTable's own (They Owe Me / I Owe
    // Them) plus the batch-settlement section's — this is the latter, found
    // via the <form> that also holds "Request Selected".
    const batchForm = screen.getByRole("button", { name: "Request Selected" }).closest("form")!;
    await user.click(within(batchForm).getByRole("button", { name: "Select All" }));

    expect(props.onSelectDebts).toHaveBeenCalledWith([availableDebt], true);
  });

  it("submits the batch-settlement form", async () => {
    const debt = makeDebt();
    const user = userEvent.setup();
    const props = baseProps({
      balance: makeBalance({ iOweThem: [debt], theyOweMe: [] }),
      selectedIOweThem: [debt]
    });
    renderWithProviders(<PersonDebtDetail {...props} />);

    await user.click(screen.getByRole("button", { name: "Request Selected" }));

    expect(props.onSubmitBatchSettlement).toHaveBeenCalled();
  });
});
