import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { routes } from "../constants/routes";
import { useAuth } from "../hooks/useAuth";

/** Waits for the boot-time silent session restore to settle, then redirects to login if there is no authenticated user. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (auth.isInitializing) {
    return null;
  }

  if (!auth.user) {
    return <Navigate to={routes.login} replace />;
  }

  return children;
}
