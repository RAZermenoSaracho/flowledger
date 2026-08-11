import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Category } from "../../../../types/categories.types";
import type { ProviderImportedTransaction } from "../../../../types/transactions.types";
import {
  ImportedTransactionCard,
  importedTransactionType,
  providerAccountLabel
} from "../ImportedTransactionCard";

function makeTransaction(
  overrides: Partial<ProviderImportedTransaction> = {}
): ProviderImportedTransaction {
  return {
    id: "pt-1",
    provider: "syncfy",
    providerAccountId: "pa-1",
    providerTransactionId: "raw-1",
    description: "Coffee shop",
    amount: -5.5,
    currency: "USD",
    transactionDate: "2024-01-15T00:00:00.000Z",
    status: "pending",
    categoryId: null,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    name: "Coffee",
    type: "expense",
    isArchived: false,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function baseProps(overrides: Partial<Parameters<typeof ImportedTransactionCard>[0]> = {}) {
  return {
    transaction: makeTransaction(),
    categories: [makeCategory()],
    isSelected: false,
    isSelectionLocked: false,
    isImporting: false,
    isIgnoring: false,
    isUnignoring: false,
    onSelectedChange: vi.fn(),
    onCategoryChange: vi.fn(),
    onImport: vi.fn(),
    onIgnore: vi.fn(),
    onUnignore: vi.fn(),
    ...overrides
  };
}

describe("importedTransactionType", () => {
  it("classifies a negative amount as expense", () => {
    expect(importedTransactionType(makeTransaction({ amount: -5 }))).toBe("expense");
  });

  it("classifies a positive amount as income", () => {
    expect(importedTransactionType(makeTransaction({ amount: 5 }))).toBe("income");
  });

  it("returns null for a zero amount", () => {
    expect(importedTransactionType(makeTransaction({ amount: 0 }))).toBeNull();
  });
});

describe("providerAccountLabel", () => {
  it("joins account name, institution, and providerAccountId, skipping missing pieces", () => {
    const transaction = makeTransaction({
      providerAccountId: "pa-1",
      providerAccount: {
        id: "link-1",
        provider: "syncfy",
        providerAccountId: "pa-1",
        accountMetadata: { name: "Checking ••1234" },
        connection: { id: "conn-1", institutionName: "Test Bank", status: "active" }
      }
    });
    expect(providerAccountLabel(transaction)).toBe("Checking ••1234 · Test Bank · pa-1");
  });

  it("falls back to just providerAccountId when no metadata/institution is available", () => {
    expect(providerAccountLabel(makeTransaction({ providerAccountId: "pa-1" }))).toBe("pa-1");
  });
});

describe("ImportedTransactionCard", () => {
  it("renders the description, status badge, and amount", () => {
    renderWithProviders(<ImportedTransactionCard {...baseProps()} />);
    expect(screen.getByText("Coffee shop")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("-$5.50")).toHaveClass("text-coral");
  });

  it("shows a needs-classification message for a pending row without a category", () => {
    renderWithProviders(<ImportedTransactionCard {...baseProps()} />);
    expect(
      screen.getByText("This transaction needs classification before import.")
    ).toBeInTheDocument();
  });

  it("omits the needs-classification message once a category is set", () => {
    renderWithProviders(
      <ImportedTransactionCard
        {...baseProps({ transaction: makeTransaction({ categoryId: "cat-1" }) })}
      />
    );
    expect(
      screen.queryByText("This transaction needs classification before import.")
    ).not.toBeInTheDocument();
  });

  it("filters the category select to categories matching the transaction's inferred type", () => {
    renderWithProviders(
      <ImportedTransactionCard
        {...baseProps({
          categories: [makeCategory({ id: "cat-expense", type: "expense" }), makeCategory({ id: "cat-income", name: "Salary", type: "income" })]
        })}
      />
    );
    expect(screen.getByRole("option", { name: "Coffee" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Salary" })).not.toBeInTheDocument();
  });

  it("shows Import/Ignore for a pending row, disabling Import until a category is set", () => {
    renderWithProviders(<ImportedTransactionCard {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ignore" })).not.toBeDisabled();
  });

  it("enables Import once a category is set and calls onImport", async () => {
    const user = userEvent.setup();
    const props = baseProps({ transaction: makeTransaction({ categoryId: "cat-1" }) });
    renderWithProviders(<ImportedTransactionCard {...props} />);

    const importButton = screen.getByRole("button", { name: "Import" });
    expect(importButton).not.toBeDisabled();
    await user.click(importButton);

    expect(props.onImport).toHaveBeenCalledOnce();
  });

  it("shows Unignore instead of Import/Ignore for an ignored row", () => {
    renderWithProviders(
      <ImportedTransactionCard
        {...baseProps({ transaction: makeTransaction({ status: "ignored" }) })}
      />
    );
    expect(screen.getByRole("button", { name: "Unignore" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import" })).not.toBeInTheDocument();
  });

  it("disables the category select once the row is no longer pending", () => {
    renderWithProviders(
      <ImportedTransactionCard
        {...baseProps({ transaction: makeTransaction({ status: "processed" }) })}
      />
    );
    expect(screen.getByLabelText("Category")).toBeDisabled();
  });

  it("calls onSelectedChange/onCategoryChange from their controls", async () => {
    const user = userEvent.setup();
    const props = baseProps({ transaction: makeTransaction({ categoryId: "cat-1" }) });
    renderWithProviders(<ImportedTransactionCard {...props} />);

    await user.click(screen.getByRole("checkbox", { name: "Select imported transaction Coffee shop" }));
    expect(props.onSelectedChange).toHaveBeenCalledOnce();

    await user.selectOptions(screen.getByLabelText("Category"), "");
    expect(props.onCategoryChange).toHaveBeenCalledWith(null);
  });

  it("locks the selection checkbox when isSelectionLocked", () => {
    renderWithProviders(<ImportedTransactionCard {...baseProps({ isSelectionLocked: true })} />);
    expect(
      screen.getByRole("checkbox", { name: "Select imported transaction Coffee shop" })
    ).toBeDisabled();
  });
});
