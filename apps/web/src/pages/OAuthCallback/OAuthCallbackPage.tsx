import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "../../components/Card";
import { routes } from "../../constants/routes";
import { useAuth } from "../../hooks/useAuth";
import { safeRedirect } from "../../utils/safeRedirect";

function readDestination() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return safeRedirect(params.get("redirect"), routes.dashboard);
}

/**
 * Finishes Google sign-in. The API has already set the session cookies, so the page waits for
 * `AuthProvider`'s session restore, then navigates once to the destination carried in the fragment.
 */
export function OAuthCallbackPage() {
  const { user, isInitializing, isSessionUnavailable } = useAuth();
  const navigate = useNavigate();
  const [destination] = useState(readDestination);
  const hasNavigated = useRef(false);

  useEffect(() => {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search
    );
  }, []);

  useEffect(() => {
    if (!user || hasNavigated.current) return;
    hasNavigated.current = true;
    navigate(destination, { replace: true });
  }, [user, destination, navigate]);

  const isRejected = !isInitializing && !user && !isSessionUnavailable;

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 dark:bg-slate-950">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold">Signing in</h1>
        {isSessionUnavailable && !user ? (
          <p role="status" className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            We can't reach FlowLedger right now. We'll keep trying.
          </p>
        ) : null}
        {isRejected ? (
          <div role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            <p>Google sign-in didn't finish on this device.</p>
            <Link to={routes.login} className="mt-2 inline-block font-semibold underline">
              Go to login
            </Link>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
