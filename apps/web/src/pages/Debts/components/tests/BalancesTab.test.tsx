import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { PersonBalance } from "../../../../types/debts.types";
import { BalancesTab } from "../BalancesTab";

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
    summaryCurrency: "USD",
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

  it("renders each balance as a card with amounts and the visible/total count", () => {
    renderWithProviders(<BalancesTab {...baseProps()} />);
    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getByText(/sam@example.com/)).toBeInTheDocument();
    expect(screen.getAllByText("$100.00").length).toBeGreaterThan(0);
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
  });

  it("links each card to that person's detail page", () => {
    renderWithProviders(<BalancesTab {...baseProps()} />);
    expect(screen.getByText("Sam").closest("a")).toHaveAttribute(
      "href",
      "/debts/balances/user-2"
    );
  });
});
