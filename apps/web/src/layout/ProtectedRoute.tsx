import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { routes } from "../constants/routes";
import { useAuth } from "../hooks/useAuth";
import { getToken } from "../services/auth.client";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (!auth.user && !getToken()) {
    return <Navigate to={routes.login} replace />;
  }

  return children;
}
