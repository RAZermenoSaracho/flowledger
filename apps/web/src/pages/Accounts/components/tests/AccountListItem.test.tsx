import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Account } from "../../../../types/accounts.types";
import { AccountListItem } from "../AccountListItem";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Checking",
    type: "checking",
    currency: "USD",
    initialBalance: 500,
    currentBalance: 500,
    isArchived: false,
    source: "manual",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function renderItem(account: Account, preferredCurrency: string | null = null) {
  return render(
    <MemoryRouter>
      <AccountListItem
        account={account}
        preferredCurrency={preferredCurrency}
      />
    </MemoryRouter>
  );
}

describe("AccountListItem", () => {
  it("links to the account view", () => {
    renderItem(makeAccount());
    expect(screen.getByRole("link")).toHaveAttribute("href", "/accounts/acc-1");
  });

  it("renders name, source badge, type label/currency, and FlowLedger balance", () => {
    renderItem(makeAccount());
    expect(screen.getByText("Checking")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText(/Checking \/ debit · USD/)).toBeInTheDocument();
    expect(
      screen.getByText(/FlowLedger balance \$500\.00/)
    ).toBeInTheDocument();
  });

  it("shows 'Synced' badge and 'Archived' badge appropriately", () => {
    renderItem(makeAccount({ source: "synced", isArchived: true }));
    expect(screen.getByText("Synced")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("shows a negative balance in the negative color", () => {
    renderItem(makeAccount({ currentBalance: -50 }));
    expect(screen.getByText(/FlowLedger balance -\$50\.00/)).toHaveClass(
      "text-coral"
    );
  });

  it("shows the identifier when present", () => {
    renderItem(makeAccount({ identifier: "****1234" }));
    expect(screen.getByText("****1234")).toBeInTheDocument();
  });

  it("shows the preferred-currency balance only when currencies differ and a converted value exists", () => {
    renderItem(makeAccount({ currentBalanceInPreferredCurrency: 450 }), "EUR");
    expect(screen.getByText("€450.00")).toBeInTheDocument();
  });

  it("omits the preferred-currency balance when it matches the account currency", () => {
    renderItem(makeAccount({ currentBalanceInPreferredCurrency: 450 }), "USD");
    expect(screen.queryByText("$450.00")).not.toBeInTheDocument();
  });
});
