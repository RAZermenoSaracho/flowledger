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
import { AccountsPage } from "./pages/AccountsPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DebtsPage } from "./pages/DebtsPage";
import { LoginPage } from "./pages/LoginPage";
import { GroupsPage } from "./pages/GroupsPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegisterPage } from "./pages/RegisterPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SharedExpensesPage } from "./pages/SharedExpensesPage";
import { TransactionDetailPage } from "./pages/TransactionDetailPage";
import { TransactionsPage } from "./pages/TransactionsPage";

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
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/groups" element={<GroupsPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route
                  path="/shared-expenses"
                  element={<SharedExpensesPage />}
                />
                <Route path="/debts" element={<DebtsPage />} />
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
