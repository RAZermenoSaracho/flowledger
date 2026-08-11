import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import type { ProviderImportedTransaction } from "../../../types/transactions.types";
import type { Transaction } from "../../../types/transactions.types";
import { TransactionsPage } from "../TransactionsPage";

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

const API_URL = "http://localhost:4000";

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

function makeImportedTransaction(
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

function mockBaseline({
  transactions = [makeTransaction()],
  importedTransactions = [] as ProviderImportedTransaction[],
  pendingCount = 0
} = {}) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    http.get(`${API_URL}/transactions`, () => HttpResponse.json({ data: transactions, meta: {} })),
    http.get(`${API_URL}/transactions/imported`, () =>
      HttpResponse.json({
        importedTransactions,
        total: importedTransactions.length,
        pendingCount
      })
    ),
    http.get(`${API_URL}/accounts`, () =>
      HttpResponse.json({
        accounts: [
          {
            id: "acc-1",
            name: "Checking",
            type: "checking",
            currency: "USD",
            initialBalance: 0,
            isArchived: false,
            createdAt: "",
            updatedAt: ""
          }
        ]
      })
    ),
    http.get(`${API_URL}/categories`, () =>
      HttpResponse.json({
        categories: [
          { id: "cat-1", name: "Groceries", type: "expense", isArchived: false, createdAt: "", updatedAt: "" }
        ]
      })
    ),
    http.get(`${API_URL}/groups`, () => HttpResponse.json({ groups: [] })),
    http.get(`${API_URL}/currencies`, () =>
      HttpResponse.json({
        currencies: [{ code: "USD", name: "US Dollar" }],
        fiat: [{ code: "USD", name: "US Dollar" }],
        crypto: []
      })
    )
  );
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("TransactionsPage", () => {
  it("defaults to the Transactions tab, listing transactions with the create form closed", async () => {
    mockBaseline();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Add transaction" })).not.toBeInTheDocument();
  });

  it("opens the create-transaction form via the AddRecordButton", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: "Add transaction" })[0]!);

    expect(screen.getByRole("heading", { name: "New transaction" })).toBeInTheDocument();
  });

  it("switches to the Imported Transactions tab, showing a pending-count badge", async () => {
    mockBaseline({ importedTransactions: [makeImportedTransaction()], pendingCount: 1 });
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    await user.click(
      screen.getByRole("button", { name: "Imported Transactions (1 pending)" })
    );

    expect(screen.getByText("Coffee shop")).toBeInTheDocument();
  });

  it("shows the pending-review banner on the imported tab and 'Show pending' re-filters to pending", async () => {
    mockBaseline({ importedTransactions: [makeImportedTransaction()], pendingCount: 1 });
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    // The banner only renders within the Imported Transactions tab, not
    // alongside the personal-transactions list.
    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    await user.click(
      screen.getByRole("button", { name: "Imported Transactions (1 pending)" })
    );

    await waitFor(() =>
      expect(screen.getByText("You have 1 imported transaction pending review.")).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Show pending" }));

    await waitFor(() => expect(screen.getByText("Coffee shop")).toBeInTheDocument());
    expect(screen.getByText("Status is pending")).toBeInTheDocument();
  });

  it("deletes a transaction after confirmation", async () => {
    mockBaseline();
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/transactions/tx-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    await waitFor(() => expect(deleted).toBe(true));
  });

  it("does not delete when the confirmation is dismissed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockBaseline();
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/transactions/tx-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(deleted).toBe(false);
  });

  it("groups transactions by category when 'Group by Category' is active", async () => {
    mockBaseline({
      transactions: [
        makeTransaction({ id: "tx-1", name: "Groceries", categoryId: "cat-1" }),
        makeTransaction({
          id: "tx-2",
          name: "Salary",
          categoryId: null,
          category: null,
          type: "income"
        })
      ]
    });
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Filter, group, and sort" }));
    await user.click(screen.getByLabelText("Category"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 3, name: "Groceries" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 3, name: "Uncategorized" })).toBeInTheDocument();
    });
  });

  it("imports a single imported transaction end-to-end", async () => {
    mockBaseline({
      importedTransactions: [makeImportedTransaction({ categoryId: "cat-1" })],
      pendingCount: 1
    });
    let imported = false;
    server.use(
      http.post(`${API_URL}/transactions/imported/pt-1/import`, () => {
        imported = true;
        return HttpResponse.json({ importedTransaction: makeImportedTransaction() });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    await user.click(
      screen.getByRole("button", { name: "Imported Transactions (1 pending)" })
    );
    await waitFor(() => expect(screen.getByText("Coffee shop")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(imported).toBe(true));
  });

  it("navigates to the edit page from a transaction's Edit action", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <TransactionsPage />
        <LocationProbe />
      </>,
      { withAuth: true, route: "/transactions" }
    );

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/transactions/tx-1/edit");
  });
});
