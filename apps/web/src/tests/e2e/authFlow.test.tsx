import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { routes } from "../../constants/routes";
import { AuthProvider } from "../../hooks/useAuth";
import { ThemeProvider } from "../../hooks/useTheme";
import { AppLayout } from "../../layout/AppLayout";
import { ProtectedRoute } from "../../layout/ProtectedRoute";
import { AccountsPage } from "../../pages/Accounts/AccountsPage";
import { DashboardPage } from "../../pages/Dashboard/DashboardPage";
import { LoginPage } from "../../pages/Login/LoginPage";
import { TransactionsPage } from "../../pages/Transactions/TransactionsPage";
import { server } from "../mocks/server";

const API_URL = "http://localhost:4000";

const authedUser = {
  id: "user-1",
  name: "Jane Doe",
  email: "jane@example.com",
  planType: "free" as const,
  mobileSidebarSide: "left" as const,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

/** A trimmed replica of main.tsx's real route tree, using MemoryRouter — see
 * that file for the authoritative structure this must stay in sync with. */
function App({ initialEntry = "/" }: { initialEntry?: string }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route path={routes.login} element={<LoginPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/accounts" element={<AccountsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function mockAuthedAppData() {
  server.use(
    http.get(`${API_URL}/reports/summary`, () =>
      HttpResponse.json({
        summary: {
          totalIncome: 0,
          totalGrossIncome: 0,
          totalNetIncome: 0,
          totalExpenses: 0,
          totalGrossExpenses: 0,
          totalExpenseReimbursements: 0,
          totalNetExpenses: 0,
          currentBalance: 0,
          reportIncome: 0,
          reportExpenses: 0,
          reportBalance: 0
        },
        currency: "USD"
      })
    ),
    http.get(`${API_URL}/reports/monthly-cashflow`, () =>
      HttpResponse.json({ cashflow: [], currency: "USD" })
    ),
    http.get(`${API_URL}/transactions`, () => HttpResponse.json({ data: [], meta: {} })),
    http.get(`${API_URL}/transactions/imported`, () =>
      HttpResponse.json({ importedTransactions: [], total: 0, pendingCount: 0 })
    ),
    http.get(`${API_URL}/accounts`, () => HttpResponse.json({ accounts: [] })),
    http.get(`${API_URL}/categories`, () => HttpResponse.json({ categories: [] })),
    http.get(`${API_URL}/groups`, () => HttpResponse.json({ groups: [] })),
    http.get(`${API_URL}/currencies`, () =>
      HttpResponse.json({
        currencies: [{ code: "USD", name: "US Dollar" }],
        fiat: [{ code: "USD", name: "US Dollar" }],
        crypto: []
      })
    ),
    http.get(`${API_URL}/notifications/unread-count`, () => HttpResponse.json({ count: 0 })),
    http.get(`${API_URL}/transactions/imported/pending-count`, () =>
      HttpResponse.json({ count: 0 })
    ),
    http.get(`${API_URL}/providers/connectors`, () => HttpResponse.json({ connectors: [] })),
    http.get(`${API_URL}/providers/accounts`, () => HttpResponse.json({ accounts: [] }))
  );
}

describe("auth flow (e2e)", () => {
  it("redirects an unauthenticated visitor from a protected route to /login", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 }))
    );
    render(<App initialEntry="/transactions" />);

    await waitFor(() => expect(screen.getByLabelText("Email")).toBeInTheDocument());
  });

  it("logs in, lands on the protected dashboard, navigates via the sidebar, then signs out back to /login", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${API_URL}/auth/login`, () =>
        HttpResponse.json({ token: "tok", user: authedUser })
      ),
      http.post(`${API_URL}/auth/logout`, () => new HttpResponse(null, { status: 204 }))
    );
    mockAuthedAppData();
    const user = userEvent.setup();
    render(<App initialEntry="/login" />);

    await user.type(screen.getByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByText("Monthly cashflow")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Account.*Jane Doe/s })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Transactions" }));
    await waitFor(() => expect(screen.getByText("No transactions found.")).toBeInTheDocument());

    await user.click(screen.getAllByRole("button", { name: "Sign out" })[0]!);

    await waitFor(() => expect(screen.getByLabelText("Email")).toBeInTheDocument());
  });
});
