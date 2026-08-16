import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { routes } from "../../constants/routes";
import { AuthProvider } from "../../hooks/useAuth";
import { ThemeProvider } from "../../hooks/useTheme";
import { AppLayout } from "../../layout/AppLayout";
import { ProtectedRoute } from "../../layout/ProtectedRoute";
import { DashboardPage } from "../../pages/Dashboard/DashboardPage";
import { LoginPage } from "../../pages/Login/LoginPage";
import { refreshAccessToken } from "../../services/api.client";
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
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function mockBaseline() {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () =>
      HttpResponse.json({ token: "tok", user: authedUser })
    ),
    http.get(`${API_URL}/notifications/unread-count`, () => HttpResponse.json({ count: 0 })),
    http.get(`${API_URL}/notifications`, () => HttpResponse.json({ notifications: [] })),
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
    http.get(`${API_URL}/transactions`, () => HttpResponse.json({ data: [], meta: {} }))
  );
}

describe("session expiry -> redirect to login (integration)", () => {
  it("redirects a signed-in user to /login once a mid-session refresh is exhausted", async () => {
    mockBaseline();
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Monthly cashflow" })).toBeInTheDocument()
    );
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();

    // The refresh cookie becomes invalid mid-session (expired, or rotated
    // away by a login/logout elsewhere) — this is the same
    // `refreshAccessToken()` that `apiRequest`'s own 401 retry calls.
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 }))
    );
    await refreshAccessToken();

    await waitFor(() => expect(screen.getByLabelText("Email")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Monthly cashflow" })).not.toBeInTheDocument();
  });
});
