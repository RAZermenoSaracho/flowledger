import "./polyfills";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { routes } from "./constants/routes";
import { AuthProvider } from "./hooks/useAuth";
import { ThemeProvider } from "./hooks/useTheme";
import { AppLayout } from "./layout/AppLayout";
import { ProtectedRoute } from "./layout/ProtectedRoute";
import { AccountsPage } from "./pages/Accounts/AccountsPage";
import { CategoriesPage } from "./pages/Categories/CategoriesPage";
import { DashboardPage } from "./pages/Dashboard/DashboardPage";
import { DebtsPage } from "./pages/Debts/DebtsPage";
import { PersonDebtDetailPage } from "./pages/Debts/PersonDebtDetailPage";
import { LoginPage } from "./pages/Login/LoginPage";
import { GroupsPage } from "./pages/Groups/GroupsPage";
import { OAuthCallbackPage } from "./pages/OAuthCallback/OAuthCallbackPage";
import { ProfilePage } from "./pages/Profile/ProfilePage";
import { RegisterPage } from "./pages/Register/RegisterPage";
import { ReportsPage } from "./pages/Reports/ReportsPage";
import { TransactionDetailPage } from "./pages/Transactions/TransactionDetailPage";
import { TransactionEditPage } from "./pages/Transactions/TransactionEditPage";
import { TransactionsPage } from "./pages/Transactions/TransactionsPage";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path={routes.login} element={<LoginPage />} />
              <Route path={routes.register} element={<RegisterPage />} />
              <Route path={routes.oauthCallback} element={<OAuthCallbackPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route
                  path="/transactions/:id"
                  element={<TransactionDetailPage />}
                />
                <Route
                  path="/transactions/:id/edit"
                  element={<TransactionEditPage />}
                />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/groups" element={<GroupsPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route
                  path="/shared-expenses"
                  element={<Navigate to="/debts?tab=sharedExpenses" replace />}
                />
                <Route path="/debts" element={<DebtsPage />} />
                <Route
                  path="/debts/balances/:personKey"
                  element={<PersonDebtDetailPage />}
                />
                <Route path="/profile" element={<ProfilePage />} />
                <Route
                  path="/profile/edit"
                  element={<Navigate to="/profile" replace />}
                />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
