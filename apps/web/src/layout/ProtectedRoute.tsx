import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { routes } from "../constants/routes";
import { useAuth } from "../hooks/useAuth";
import { tokenStore } from "../services/api";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (!auth.user && !tokenStore.get()) {
    return <Navigate to={routes.login} replace />;
  }

  return children;
}
