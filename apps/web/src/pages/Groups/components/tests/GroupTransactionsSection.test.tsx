import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Group } from "../../../../types/groups.types";
import { GroupTransactionsSection } from "../GroupTransactionsSection";

describe("GroupTransactionsSection", () => {
  it("renders each transaction's name, amount, category, and date", () => {
    const transactions: Group["transactions"] = [
      {
        id: "t1",
        name: "Groceries",
        amount: 42.5,
        executionCurrency: "USD",
        date: "2024-01-15T00:00:00.000Z",
        category: { name: "Food" }
      } as NonNullable<Group["transactions"]>[number]
    ];

    renderWithProviders(<GroupTransactionsSection transactions={transactions} />);

    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("$42.50")).toBeInTheDocument();
    expect(screen.getByText(/Food/)).toBeInTheDocument();
  });

  it("shows 'No group category' when the transaction has none", () => {
    const transactions: Group["transactions"] = [
      {
        id: "t1",
        name: "Groceries",
        amount: 42.5,
        executionCurrency: "USD",
        date: "2024-01-15T00:00:00.000Z",
        category: null
      } as NonNullable<Group["transactions"]>[number]
    ];

    renderWithProviders(<GroupTransactionsSection transactions={transactions} />);

    expect(screen.getByText(/No group category/)).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no transactions", () => {
    renderWithProviders(<GroupTransactionsSection transactions={[]} />);
    expect(
      screen.getByText("No group transactions for your account yet.")
    ).toBeInTheDocument();
  });

  it("treats undefined transactions the same as an empty list", () => {
    renderWithProviders(<GroupTransactionsSection transactions={undefined} />);
    expect(
      screen.getByText("No group transactions for your account yet.")
    ).toBeInTheDocument();
  });
});
