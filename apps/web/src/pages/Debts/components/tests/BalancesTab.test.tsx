import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { PersonBalance } from "../../../../types/debts.types";
import { BalancesTab } from "../BalancesTab";

function makeBalance(overrides: Partial<PersonBalance> = {}): PersonBalance {
  return {
    key: "user-2",
    person: { id: "user-2", username: "sam", nickname: null, displayName: "Sam" },
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
    summaryCurrency: "USD",
    ...overrides
  };
}

describe("BalancesTab", () => {
  it("shows the list's loading state and error alert", () => {
    const { unmount } = renderWithProviders(<BalancesTab {...baseProps({ balances: [], visibleBalances: [], isLoading: true })} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    unmount();
    renderWithProviders(<BalancesTab {...baseProps({ error: "Could not load debts." })} />);
    expect(screen.getByText("Could not load debts.")).toBeInTheDocument();
  });

  it("shows 'No outstanding balances.' when the list is empty", () => {
    renderWithProviders(<BalancesTab {...baseProps({ balances: [], visibleBalances: [] })} />);
    expect(screen.getByText("No outstanding balances.")).toBeInTheDocument();
  });

  it("shows 'No balances match your search.' when search narrows to nothing", () => {
    renderWithProviders(<BalancesTab {...baseProps({ visibleBalances: [] })} />);
    expect(screen.getByText("No balances match your search.")).toBeInTheDocument();
  });

  it("renders each balance as a card with amounts and the record count", () => {
    renderWithProviders(<BalancesTab {...baseProps()} />);
    expect(screen.getByText("Sam (@sam)")).toBeInTheDocument();
    expect(screen.queryByText(/@example\.com/)).not.toBeInTheDocument();
    expect(screen.getAllByText("$100.00").length).toBeGreaterThan(0);
    expect(screen.getByText("1 record")).toBeInTheDocument();
  });

  it("links each card to that person's detail page", () => {
    renderWithProviders(<BalancesTab {...baseProps()} />);
    expect(screen.getByText("Sam (@sam)").closest("a")).toHaveAttribute(
      "href",
      "/debts/balances/user-2"
    );
  });
});
