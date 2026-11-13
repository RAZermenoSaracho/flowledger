import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../../../types/transactions.types";
import { CrossCurrencyRecord } from "../CrossCurrencyRecord";

const transfer = (overrides: Partial<Transaction> = {}) =>
  ({
    id: "t",
    name: "Move",
    amount: "100",
    executionCurrency: "USD",
    type: "transfer",
    date: "2026-05-31T21:33:15.979Z",
    account: { currency: "USD" },
    transferToAccount: { currency: "MXN" },
    destinationAmount: "1700",
    ...overrides
  }) as Transaction;

describe("CrossCurrencyRecord", () => {
  it("shows the net-only record with the effective rate and no fee", () => {
    render(<CrossCurrencyRecord transaction={transfer()} />);
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("MX$1,700.00")).toBeInTheDocument();
    expect(screen.getByText("1 USD = 17 MXN")).toBeInTheDocument();
    expect(screen.getByText("Effective rate")).toBeInTheDocument();
    expect(screen.queryByText("Fee")).not.toBeInTheDocument();
    expect(screen.queryByText("Rate before fee")).not.toBeInTheDocument();
  });

  it("shows the fee and the rate before it", () => {
    render(
      <CrossCurrencyRecord transaction={transfer({ destinationAmount: "1666", feeAmount: "2", feeCurrency: "USD" })} />
    );
    expect(screen.getByText("1 USD = 16.66 MXN")).toBeInTheDocument();
    expect(screen.getByText("$2.00")).toBeInTheDocument();
    expect(screen.getByText("Rate before fee")).toBeInTheDocument();
    expect(screen.getByText("1 USD = 17 MXN")).toBeInTheDocument();
  });

  it("renders nothing for a single-currency transaction", () => {
    const { container } = render(
      <CrossCurrencyRecord transaction={transfer({ transferToAccount: { currency: "USD" } as Transaction["transferToAccount"] })} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
