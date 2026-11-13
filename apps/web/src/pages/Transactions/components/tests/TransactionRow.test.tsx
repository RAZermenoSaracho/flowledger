import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Transaction } from "../../../../types/transactions.types";
import { TransactionRow } from "../TransactionRow";

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    name: "Groceries",
    amount: "42.5",
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

describe("TransactionRow", () => {
  it("renders the transaction link and expense amount colour", () => {
    renderWithProviders(
      <TransactionRow
        transaction={makeTransaction()}
        isDeleting={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByRole("link", { name: "Groceries" })).toHaveAttribute(
      "href",
      "/transactions/tx-1"
    );
    expect(screen.getByText("$42.50")).toHaveClass("text-coral");
  });

  it("shows a transfer's from -> to account label and 'Transfer' type", () => {
    const transaction = makeTransaction({
      type: "transfer",
      categoryId: null,
      category: null,
      transferToAccountId: "acc-2",
      transferToAccount: {
        id: "acc-2",
        name: "Savings"
      } as Transaction["transferToAccount"]
    });
    renderWithProviders(
      <TransactionRow
        transaction={transaction}
        isDeleting={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Transfer · Checking -> Savings/)
    ).toBeInTheDocument();
  });

  it("shows a pending-classification highlight and message for an incomplete non-transfer transaction", () => {
    renderWithProviders(
      <TransactionRow
        transaction={makeTransaction({ categoryId: null, category: null })}
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
      <TransactionRow
        transaction={makeTransaction({
          type: "transfer",
          transferToAccountId: null,
          transferToAccount: null
        })}
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
      <TransactionRow
        transaction={transaction}
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
      <TransactionRow
        transaction={makeTransaction()}
        isDeleting={false}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Actions for Groceries" })
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith(makeTransaction());

    await user.click(
      screen.getByRole("button", { name: "Actions for Groceries" })
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(makeTransaction());
  });

  it("shows income amounts in the positive color", () => {
    renderWithProviders(
      <TransactionRow
        transaction={makeTransaction({ type: "income", amount: "1000" })}
        isDeleting={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("$1,000.00")).toHaveClass("text-pine");
  });

  describe("date display", () => {
    const originalTz = process.env.TZ;

    afterEach(() => {
      process.env.TZ = originalTz;
    });

    function renderOne(transaction: Transaction) {
      renderWithProviders(
        <TransactionRow
          transaction={transaction}
          isDeleting={false}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );
    }

    function expectedDateTime(timeZone: string, iso: string) {
      return new Date(iso).toLocaleString(undefined, {
        timeZone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    }

    it.each(["America/Mexico_City", "Pacific/Kiritimati"])(
      "shows the local date and time in %s",
      (zone) => {
        process.env.TZ = zone;
        const date = "2026-11-06T03:00:00.000Z";
        renderOne(makeTransaction({ date }));
        expect(
          screen.getByText((content) =>
            content.startsWith(`${expectedDateTime(zone, date)} ·`)
          )
        ).toBeInTheDocument();
      }
    );

    it("shows no time for an unedited provider date at UTC noon", () => {
      process.env.TZ = "America/Mexico_City";
      const date = "2026-06-04T12:00:00.000Z";
      renderOne(
        makeTransaction({
          date,
          providerImportedTransaction: { transactionDate: date }
        })
      );
      const shown = new Date(date).toLocaleDateString(undefined, {
        timeZone: "America/Mexico_City"
      });
      expect(
        screen.getByText((content) => content.startsWith(`${shown} ·`))
      ).toBeInTheDocument();
    });
  });
});
