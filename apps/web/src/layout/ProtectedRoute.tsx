import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { routes } from "../constants/routes";
import { useAuth } from "../hooks/useAuth";

/** Waits for the boot-time silent session restore to settle, then redirects to `/login?redirect=<current path + query>` if there is no authenticated user. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isInitializing) {
    return null;
  }

  if (!auth.user) {
    return <Navigate to={`${routes.login}?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  return children;
}
