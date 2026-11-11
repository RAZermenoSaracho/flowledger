import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Transaction } from "../../../../types/transactions.types";
import { hasRelatedRecords, TransactionRelatedTab } from "../TransactionRelatedTab";

const tx = (overrides: Partial<Transaction> = {}) =>
  ({ id: "tx-1", name: "Main", amount: 10, executionCurrency: "USD", date: "2026-05-31T21:00:00.000Z", ...overrides }) as Transaction;

describe("hasRelatedRecords", () => {
  it("is false for a transaction with no relations or import", () => {
    expect(hasRelatedRecords(tx())).toBe(false);
    expect(hasRelatedRecords(tx({ relations: [], relatedBy: [] }))).toBe(false);
  });

  it("is true for a settlement link or an import", () => {
    expect(hasRelatedRecords(tx({ relations: [{ id: "r", relationType: "settlement_payment", relatedTransaction: tx({ id: "b" }) }] }))).toBe(true);
    expect(hasRelatedRecords(tx({ providerImportedTransaction: { transactionDate: "2026-05-31T12:00:00.000Z" } }))).toBe(true);
  });
});

describe("TransactionRelatedTab", () => {
  it("links each settlement transaction and shows its amount", () => {
    renderWithProviders(
      <TransactionRelatedTab
        transaction={tx({
          relations: [{ id: "r", relationType: "settlement_payment", relatedTransaction: tx({ id: "tx-2", name: "Payback", amount: 25 }) }]
        })}
      />
    );
    expect(screen.getByRole("link", { name: "Payback" })).toHaveAttribute("href", "/transactions/tx-2");
    expect(screen.getByText("$25.00")).toBeInTheDocument();
    expect(screen.getByText("This transaction was not imported.")).toBeInTheDocument();
  });

  it("shows the originating import and empty settlements", () => {
    renderWithProviders(
      <TransactionRelatedTab transaction={tx({ providerImportedTransaction: { transactionDate: "2026-05-31T12:00:00.000Z" } })} />
    );
    expect(screen.getByText("No settlement transactions.")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Provider date" })).toBeInTheDocument();
  });
});
