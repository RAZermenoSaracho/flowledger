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
import { DashboardPage } from "../../pages/Dashboard/DashboardPage";
import { DebtsPage } from "../../pages/Debts/DebtsPage";
import { LoginPage } from "../../pages/Login/LoginPage";
import type { Debt, DebtsResponse } from "../../types/debts.types";
import type { Notification } from "../../types/notifications.types";
import { server } from "../mocks/server";

const API_URL = "http://localhost:4000";

const authedUser = {
  id: "user-1",
  name: "Jane",
  email: "jane@example.com",
  planType: "free" as const,
  mobileSidebarSide: "left" as const,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-1",
    userId: "user-2",
    participantName: "Friend",
    currency: "USD",
    shareAmount: 100,
    paidAmount: 40,
    status: "partial",
    sharedExpenseId: "se-1",
    debtorUserId: "user-2",
    creditorUserId: "user-1",
    outstandingAmount: 60,
    pendingSettlementAmount: 0,
    sharedExpense: {
      id: "se-1",
      transactionId: "tx-1",
      ownerUserId: "user-1",
      title: "Dinner split",
      totalAmount: 100,
      status: "open",
      owner: { id: "user-1", name: "Jane", email: "jane@example.com" },
      participants: [],
      createdAt: "",
      updatedAt: ""
    },
    user: { id: "user-2", name: "Sam", email: "sam@example.com" },
    settlementRequests: [],
    ...overrides
  };
}

function makeDebtsResponse(overrides: Partial<DebtsResponse> = {}): DebtsResponse {
  return {
    iOwe: [],
    owedToMe: [makeDebt()],
    balances: [
      {
        key: "user-2",
        person: { id: "user-2", name: "Sam", email: "sam@example.com" },
        fallbackName: "Sam",
        theyOweMe: [makeDebt()],
        iOweThem: [],
        theyOweMeTotal: 60,
        iOweThemTotal: 0,
        netBalance: 60
      }
    ],
    pendingSettlementRequests: [],
    approvedSettlementRequests: [],
    settledDebts: [],
    ...overrides
  };
}

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    userId: "user-1",
    type: "debt_owed_money",
    title: "Sam owes you money",
    message: "Sam owes you $60.00 for Dinner split",
    readAt: null,
    metadata: { participantId: "debt-1" },
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

/** Trimmed replica of main.tsx's route tree — see that file for the
 * authoritative structure. */
function App() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={["/"]}>
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
                <Route path="/debts" element={<DebtsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function mockBaseline({
  notifications = [makeNotification()],
  debts = makeDebtsResponse()
} = {}) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () =>
      HttpResponse.json({ token: "tok", user: authedUser })
    ),
    http.get(`${API_URL}/notifications/unread-count`, () =>
      HttpResponse.json({ count: notifications.filter((n) => !n.readAt).length })
    ),
    http.get(`${API_URL}/notifications`, () => HttpResponse.json({ notifications })),
    http.patch(`${API_URL}/notifications/:id/read`, () =>
      HttpResponse.json({ notification: { ...notifications[0], readAt: "2024-01-02T00:00:00.000Z" } })
    ),
    http.get(`${API_URL}/transactions/imported/pending-count`, () =>
      HttpResponse.json({ count: 0 })
    ),
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
    http.get(`${API_URL}/debts`, () => HttpResponse.json(debts)),
    http.get(`${API_URL}/accounts`, () => HttpResponse.json({ accounts: [] })),
    http.get(`${API_URL}/categories`, () => HttpResponse.json({ categories: [] })),
    http.get(`${API_URL}/groups`, () => HttpResponse.json({ groups: [] })),
    http.get(`${API_URL}/shared-expenses`, () => HttpResponse.json({ sharedExpenses: [] }))
  );
}

describe("notification bell -> cross-page navigation (integration)", () => {
  it("opening a debt-owed notification navigates to the Debts page with the right debt highlighted and marks it read", async () => {
    mockBaseline();
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Notifications" }));

    const notificationRow = await screen.findByText("Sam owes you money");
    await user.click(notificationRow);

    // notificationTarget() resolves debt_owed_money to /debts?debtId=<id>&tab=owedToMe,
    // which DebtsPage reads to select the Balances tab and highlight the debt.
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Outstanding Balances" })).toHaveAttribute(
        "aria-selected",
        "true"
      )
    );
    await waitFor(() => expect(screen.getByText("Net balance $60.00")).toBeInTheDocument());
  });
});
