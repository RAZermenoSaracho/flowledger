import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type {
  RelatedTransaction,
  Transaction
} from "../../../../types/transactions.types";
import {
  hasRelatedRecords,
  TransactionRelatedTab
} from "../TransactionRelatedTab";

const tx = (overrides: Partial<Transaction> = {}) =>
  ({
    id: "tx-1",
    name: "Main",
    amount: 10,
    executionCurrency: "USD",
    date: "2026-05-31T21:00:00.000Z",
    ...overrides
  }) as Transaction;
const related = (
  overrides: Partial<RelatedTransaction> = {}
): RelatedTransaction => ({
  id: "tx-2",
  description: "Payback",
  amount: 25,
  currency: "USD",
  date: "2026-05-31T21:00:00.000Z",
  type: "income",
  relation: "settlement",
  settlementStatus: "approved",
  ...overrides
});
const origin = {
  title: "Dinner",
  amount: 90,
  currency: "USD",
  date: "2026-05-30T21:00:00.000Z",
  type: "expense",
  owner: { id: "a", username: "alice", nickname: null, displayName: null }
};

describe("hasRelatedRecords", () => {
  it("is false without related transactions or an origin, even for an imported transaction", () => {
    expect(hasRelatedRecords(tx())).toBe(false);
    expect(
      hasRelatedRecords(tx({ relatedTransactions: [], settlementOrigin: null }))
    ).toBe(false);
    expect(
      hasRelatedRecords(
        tx({
          providerImportedTransaction: {
            transactionDate: "2026-05-31T12:00:00.000Z"
          }
        })
      )
    ).toBe(false);
  });

  it("is true for a related transaction or an origin summary", () => {
    expect(hasRelatedRecords(tx({ relatedTransactions: [related()] }))).toBe(
      true
    );
    expect(hasRelatedRecords(tx({ settlementOrigin: origin }))).toBe(true);
  });
});

describe("TransactionRelatedTab", () => {
  it("links each own settlement with amount and status", () => {
    renderWithProviders(
      <TransactionRelatedTab
        transaction={tx({
          relatedTransactions: [
            related(),
            related({ id: "tx-3", description: "Second" })
          ]
        })}
      />
    );
    expect(screen.getByRole("link", { name: "Payback" })).toHaveAttribute(
      "href",
      "/transactions/tx-2"
    );
    expect(screen.getByRole("link", { name: "Second" })).toHaveAttribute(
      "href",
      "/transactions/tx-3"
    );
    expect(screen.getAllByText("$25.00")).toHaveLength(2);
    expect(
      screen.queryByRole("region", { name: "Imported from provider" })
    ).not.toBeInTheDocument();
  });

  it("links the original expense when the viewer owns it", () => {
    renderWithProviders(
      <TransactionRelatedTab
        transaction={tx({
          relatedTransactions: [
            related({ id: "o", description: "Dinner", relation: "origin" })
          ]
        })}
      />
    );
    expect(
      screen.getByRole("region", { name: "Original expense" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dinner" })).toHaveAttribute(
      "href",
      "/transactions/o"
    );
  });

  it("shows a participant's origin as a plain, non-navigable summary", () => {
    renderWithProviders(
      <TransactionRelatedTab transaction={tx({ settlementOrigin: origin })} />
    );
    expect(screen.getByText("Dinner")).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
