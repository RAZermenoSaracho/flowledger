import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { routes } from "../constants/routes";
import { useAuth } from "../hooks/useAuth";

/** Waits for the boot-time silent session restore to settle, shows a connection message while the session can't be checked, then redirects to `/login?redirect=<current path + query>` if there is no authenticated user. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isInitializing) {
    return null;
  }

  if (auth.user) {
    return children;
  }

  if (auth.isSessionUnavailable) {
    return (
      <main className="grid min-h-screen place-items-center px-4 text-center" role="status">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Can't reach FlowLedger right now. Reconnecting…
        </p>
      </main>
    );
  }

  return <Navigate to={`${routes.login}?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
}
