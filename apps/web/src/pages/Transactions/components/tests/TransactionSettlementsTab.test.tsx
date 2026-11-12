import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { RelatedSettlement, Transaction } from "../../../../types/transactions.types";
import { hasRelatedSettlements, TransactionSettlementsTab } from "../TransactionSettlementsTab";

const tx = (relatedSettlements?: RelatedSettlement[]) =>
  ({ id: "tx-1", name: "Main", relatedSettlements }) as Transaction;
const settlement = (overrides: Partial<RelatedSettlement> = {}): RelatedSettlement => ({
  id: "req-1",
  status: "approved",
  amount: 30,
  currency: "USD",
  createdAt: "2026-05-31T12:00:00.000Z",
  approvedAt: "2026-06-01T12:00:00.000Z",
  counterparty: { id: "b", username: "bob", nickname: null, displayName: null },
  participantId: "p-1",
  transaction: { id: "tx-2", description: "Payback", date: "2026-06-01T12:00:00.000Z", type: "income" },
  ...overrides
});

describe("hasRelatedSettlements", () => {
  it("is true only when there are settlement requests", () => {
    expect(hasRelatedSettlements(tx())).toBe(false);
    expect(hasRelatedSettlements(tx([]))).toBe(false);
    expect(hasRelatedSettlements(tx([settlement()]))).toBe(true);
  });
});

describe("TransactionSettlementsTab", () => {
  it("shows counterparty, amount and status, linking only requests that have an own transaction", () => {
    renderWithProviders(
      <TransactionSettlementsTab
        transaction={tx([
          settlement(),
          settlement({ id: "req-2", status: "pending", approvedAt: null, transaction: null })
        ])}
      />
    );
    expect(screen.getAllByText("@bob")).toHaveLength(2);
    expect(screen.getAllByText("$30.00")).toHaveLength(2);
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Payback" })).toHaveAttribute("href", "/transactions/tx-2");
  });
});
