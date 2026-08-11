import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Account } from "../../../../types/accounts.types";
import type { Category } from "../../../../types/categories.types";
import type { Debt, PersonBalance } from "../../../../types/debts.types";
import { BalancesTab } from "../BalancesTab";

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

function makeBalance(overrides: Partial<PersonBalance> = {}): PersonBalance {
  return {
    key: "user-2",
    person: { id: "user-2", name: "Sam", email: "sam@example.com" },
    fallbackName: "Sam",
    theyOweMe: [],
    iOweThem: [],
    theyOweMeTotal: 100,
    iOweThemTotal: 0,
    netBalance: 100,
    ...overrides
  };
}

function baseProps(overrides: Partial<Parameters<typeof BalancesTab>[0]> = {}) {
  return {
    balances: [makeBalance()],
    visibleBalances: [makeBalance()],
    onBalanceQueryChange: vi.fn(),
    selectedBalance: null,
    onSelectPerson: vi.fn(),
    summaryCurrency: "USD",
    selectedDebtIds: new Set<string>(),
    selectedIOweThem: [] as Debt[],
    accounts: [makeAccount()],
    isActing: false,
    draftFor: () => ({ amount: "0", accountId: "", categoryId: "", note: "", paymentInfo: "" }),
    isSettlementDraftComplete: () => true,
    updateDraft: vi.fn(),
    categoryOptionsFor: (): Category[] => [],
    onToggleDebt: vi.fn(),
    onSelectDebts: vi.fn(),
    onSubmitSettlement: vi.fn(async () => {}),
    onSubmitBatchSettlement: vi.fn(async () => {}),
    ...overrides
  };
}

describe("BalancesTab", () => {
  it("shows 'No outstanding balances.' when the list is empty", () => {
    renderWithProviders(<BalancesTab {...baseProps({ balances: [], visibleBalances: [] })} />);
    expect(screen.getByText("No outstanding balances.")).toBeInTheDocument();
  });

  it("shows 'No balances match your search.' when search narrows to nothing", () => {
    renderWithProviders(<BalancesTab {...baseProps({ visibleBalances: [] })} />);
    expect(screen.getByText("No balances match your search.")).toBeInTheDocument();
  });

  it("renders each balance row with amounts and the visible/total count", () => {
    renderWithProviders(<BalancesTab {...baseProps()} />);
    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getByText("sam@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("$100.00").length).toBeGreaterThan(0);
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
  });

  it("calls onSelectPerson when a row is clicked", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<BalancesTab {...props} />);

    await user.click(screen.getByText("Sam"));

    expect(props.onSelectPerson).toHaveBeenCalledWith("user-2");
  });

  it("renders PersonDebtDetail below the table once a balance is selected", () => {
    renderWithProviders(<BalancesTab {...baseProps({ selectedBalance: makeBalance() })} />);
    expect(screen.getByText("Net balance $100.00")).toBeInTheDocument();
  });

  it("omits PersonDebtDetail when no balance is selected", () => {
    renderWithProviders(<BalancesTab {...baseProps({ selectedBalance: null })} />);
    expect(screen.queryByText(/Net balance/)).not.toBeInTheDocument();
  });
});
