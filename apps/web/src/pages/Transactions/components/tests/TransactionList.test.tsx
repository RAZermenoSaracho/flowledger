import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Transaction } from "../../../../types/transactions.types";
import { TransactionList } from "../TransactionList";

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    name: "Groceries",
    amount: 42.5,
    executionCurrency: "USD",
    exchangeRate: 1,
    amountInPreferredCurrency: 42.5,
    type: "expense",
    date: "2024-01-15T00:00:00.000Z",
    accountId: "acc-1",
    categoryId: "cat-1",
    account: { id: "acc-1", name: "Checking" } as Transaction["account"],
    category: { id: "cat-1", name: "Groceries" } as Transaction["category"],
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

describe("TransactionList", () => {
  it("renders a grouped section header and transaction rows", () => {
    renderWithProviders(
      <TransactionList
        groupedTransactions={[{ key: "food", label: "Food", items: [makeTransaction()] }]}
        totalCount={1}
        isDeleting={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Groceries" })).toHaveAttribute(
      "href",
      "/transactions/tx-1"
    );
    expect(screen.getByText("$42.50")).toHaveClass("text-coral");
  });

  it("shows 'No transactions found.' when totalCount is 0", () => {
    renderWithProviders(
      <TransactionList
        groupedTransactions={[]}
        totalCount={0}
        isDeleting={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText("No transactions found.")).toBeInTheDocument();
  });

  it("shows a transfer's from -> to account label and 'Transfer' type", () => {
    const transaction = makeTransaction({
      type: "transfer",
      categoryId: null,
      category: null,
      transferToAccountId: "acc-2",
      transferToAccount: { id: "acc-2", name: "Savings" } as Transaction["transferToAccount"]
    });
    renderWithProviders(
      <TransactionList
        groupedTransactions={[{ key: "", label: "", items: [transaction] }]}
        totalCount={1}
        isDeleting={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText(/Transfer · Checking -> Savings/)).toBeInTheDocument();
  });

  it("shows a pending-classification highlight and message for an incomplete non-transfer transaction", () => {
    renderWithProviders(
      <TransactionList
        groupedTransactions={[
          { key: "", label: "", items: [makeTransaction({ categoryId: null, category: null })] }
        ]}
        totalCount={1}
        isDeleting={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(
      screen.getByText("Pending classification: add a category and account.")
    ).toBeInTheDocument();
  });

  it("shows a pending-classification message for a transfer missing an account", () => {
    renderWithProviders(
      <TransactionList
        groupedTransactions={[
          {
            key: "",
            label: "",
            items: [
              makeTransaction({ type: "transfer", transferToAccountId: null, transferToAccount: null })
            ]
          }
        ]}
        totalCount={1}
        isDeleting={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(
      screen.getByText("Pending classification: add from and to accounts.")
    ).toBeInTheDocument();
  });

  it("shows the group/category breadcrumb when the transaction belongs to a group", () => {
    const transaction = makeTransaction({
      group: { id: "group-1", name: "Roommates" } as Transaction["group"]
    });
    renderWithProviders(
      <TransactionList
        groupedTransactions={[{ key: "", label: "", items: [transaction] }]}
        totalCount={1}
        isDeleting={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText(/Roommates \/ Groceries/)).toBeInTheDocument();
  });

  it("calls onEdit/onDelete from the row's actions menu", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderWithProviders(
      <TransactionList
        groupedTransactions={[{ key: "", label: "", items: [makeTransaction()] }]}
        totalCount={1}
        isDeleting={false}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith(makeTransaction());

    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(makeTransaction());
  });

  it("shows income amounts in the positive color", () => {
    renderWithProviders(
      <TransactionList
        groupedTransactions={[
          { key: "", label: "", items: [makeTransaction({ type: "income", amount: 1000 })] }
        ]}
        totalCount={1}
        isDeleting={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("$1,000.00")).toHaveClass("text-pine");
  });
});
