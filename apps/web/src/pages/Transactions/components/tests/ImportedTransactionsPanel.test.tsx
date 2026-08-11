import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { ApiError } from "../../../../services/api.client";
import type { Category } from "../../../../types/categories.types";
import type { ProviderImportedTransaction } from "../../../../types/transactions.types";
import { ImportedTransactionsPanel } from "../ImportedTransactionsPanel";

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

function baseProps(overrides: Partial<Parameters<typeof ImportedTransactionsPanel>[0]> = {}) {
  return {
    totalCount: 1,
    importedTransactions: [makeTransaction()],
    categories: [makeCategory()],
    selectedImportedIds: [] as string[],
    selectAllFilteredImported: false,
    batchCategoryId: "",
    isPendingFilter: true,
    isIgnoredFilter: false,
    isBatchImporting: false,
    isBatchIgnoring: false,
    isBatchUnignoring: false,
    isImporting: false,
    isIgnoring: false,
    isUnignoring: false,
    isLoading: false,
    batchError: null,
    onBatchCategoryChange: vi.fn(),
    onVisibleSelectionChange: vi.fn(),
    onAllFilteredSelectionChange: vi.fn(),
    onImportSelected: vi.fn(),
    onIgnoreSelected: vi.fn(),
    onUnignoreSelected: vi.fn(),
    onToggleSelection: vi.fn(),
    onCategoryChange: vi.fn(),
    onImport: vi.fn(),
    onIgnore: vi.fn(),
    onUnignore: vi.fn(),
    ...overrides
  };
}

describe("ImportedTransactionsPanel", () => {
  it("shows the matching-row count, singular vs. plural", () => {
    const { rerender } = renderWithProviders(<ImportedTransactionsPanel {...baseProps()} />);
    expect(screen.getByText("1 matching row.")).toBeInTheDocument();

    rerender(<ImportedTransactionsPanel {...baseProps({ totalCount: 2 })} />);
    expect(screen.getByText("2 matching rows.")).toBeInTheDocument();
  });

  it("renders each imported transaction's card", () => {
    renderWithProviders(<ImportedTransactionsPanel {...baseProps()} />);
    expect(screen.getByText("Coffee shop")).toBeInTheDocument();
  });

  it("shows 'Loading imported transactions.' while isLoading", () => {
    renderWithProviders(
      <ImportedTransactionsPanel {...baseProps({ isLoading: true, importedTransactions: [] })} />
    );
    expect(screen.getByText("Loading imported transactions.")).toBeInTheDocument();
  });

  it("shows 'No imported transactions found.' once loaded with an empty list", () => {
    renderWithProviders(
      <ImportedTransactionsPanel {...baseProps({ importedTransactions: [], totalCount: 0 })} />
    );
    expect(screen.getByText("No imported transactions found.")).toBeInTheDocument();
  });

  it("marks every row selected and selection-locked when selectAllFilteredImported is true", () => {
    renderWithProviders(
      <ImportedTransactionsPanel {...baseProps({ selectAllFilteredImported: true })} />
    );
    expect(
      screen.getByRole("checkbox", { name: "Select imported transaction Coffee shop" })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Select imported transaction Coffee shop" })
    ).toBeDisabled();
  });

  it("shows the batch error message and per-row errors when batchError is set", () => {
    const error = new ApiError("Batch import failed", {
      errors: [{ id: "pt-2", message: "Missing category" }]
    });
    renderWithProviders(<ImportedTransactionsPanel {...baseProps({ batchError: error })} />);

    expect(screen.getByText("Batch import failed")).toBeInTheDocument();
    expect(screen.getByText("pt-2: Missing category")).toBeInTheDocument();
  });

  it("omits the batch error block when there is no batchError", () => {
    renderWithProviders(<ImportedTransactionsPanel {...baseProps()} />);
    expect(screen.queryByText(/Missing category/)).not.toBeInTheDocument();
  });

  it("wires row callbacks through to the correct transaction id", async () => {
    const user = userEvent.setup();
    const props = baseProps({
      importedTransactions: [makeTransaction({ categoryId: "cat-1" })]
    });
    renderWithProviders(<ImportedTransactionsPanel {...props} />);

    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(props.onImport).toHaveBeenCalledWith(makeTransaction({ categoryId: "cat-1" }));

    await user.click(screen.getByRole("button", { name: "Ignore" }));
    expect(props.onIgnore).toHaveBeenCalledWith("pt-1");
  });
});
