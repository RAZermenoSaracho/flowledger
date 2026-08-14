import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../hooks/useAuth";
import { server } from "../../../tests/mocks/server";
import type { Transaction } from "../../../types/transactions.types";
import { TransactionDetailPage } from "../TransactionDetailPage";

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

function mockBaseline(transaction: Transaction = makeTransaction()) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    http.get(`${API_URL}/transactions/tx-1`, () => HttpResponse.json({ transaction }))
  );
}

function renderPage(initialEntry = "/transactions/tx-1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthProvider>
          <Routes>
            <Route path="/transactions" element={<div>Transactions list</div>} />
            <Route path="/transactions/:id" element={<TransactionDetailPage />} />
            <Route
              path="/transactions/:id/edit"
              element={<div>Edit transaction page</div>}
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("TransactionDetailPage", () => {
  it("shows a loading message before the transaction loads", () => {
    mockBaseline();
    renderPage();
    expect(screen.getByText("Loading transaction...")).toBeInTheDocument();
  });

  it("renders the transaction's name, amount, and details", async () => {
    mockBaseline();
    renderPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Groceries" })).toBeInTheDocument());
    expect(screen.getByText("$42.50")).toBeInTheDocument();
    expect(screen.getByText("Checking")).toBeInTheDocument();
    expect(screen.getByText("Expense")).toBeInTheDocument();
  });

  it("shows a pending-classification message when account/category is missing", async () => {
    mockBaseline(makeTransaction({ categoryId: null, category: null }));
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText("Pending classification: add a category and account.")
      ).toBeInTheDocument()
    );
  });

  it("shows From/To account details and direction for a transfer", async () => {
    mockBaseline(
      makeTransaction({
        type: "transfer",
        categoryId: null,
        category: null,
        transferToAccountId: "acc-2",
        transferToAccount: { id: "acc-2", name: "Savings" } as Transaction["transferToAccount"]
      })
    );
    renderPage();

    await waitFor(() => expect(screen.getByText("Savings")).toBeInTheDocument());
    expect(screen.getByText("Checking -> Savings")).toBeInTheDocument();
  });

  it("shows the shared expense's participants when present", async () => {
    mockBaseline(
      makeTransaction({
        sharedExpense: {
          id: "se-1",
          transactionId: "tx-1",
          ownerUserId: "user-1",
          title: "Dinner split",
          totalAmount: 42.5,
          status: "open",
          participants: [
            {
              id: "p1",
              participantName: "Sam",
              currency: "USD",
              shareAmount: 20,
              paidAmount: 10,
              status: "partial"
            }
          ],
          createdAt: "",
          updatedAt: ""
        } as Transaction["sharedExpense"]
      })
    );
    renderPage();

    await waitFor(() => expect(screen.getByText("Dinner split")).toBeInTheDocument());
    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getByText(/\$10\.00 settled of \$20\.00/)).toBeInTheDocument();
  });

  it("shows 'No shared expense is attached.' when there's none", async () => {
    mockBaseline();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No shared expense is attached.")).toBeInTheDocument()
    );
  });

  it("navigates to the edit page from the Edit button", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Groceries" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText("Edit transaction page")).toBeInTheDocument();
  });

  it("deletes the transaction after confirmation and navigates back to the list", async () => {
    mockBaseline();
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/transactions/tx-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Groceries" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleted).toBe(true));
    expect(screen.getByText("Transactions list")).toBeInTheDocument();
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
    renderPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Groceries" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleted).toBe(false);
  });
});
