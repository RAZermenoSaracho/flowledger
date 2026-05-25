import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/Card";
import { routes } from "../constants/routes";
import { useAuth } from "../hooks/useAuth";
import { apiRequest, tokenStore } from "../services/api";
import type { User } from "../types/api";

export function OAuthCallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function completeOAuthLogin() {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const token = params.get("token");
      const redirect = params.get("redirect") ?? routes.dashboard;

      if (!token) {
        setError("Google authentication did not return a valid session.");
        return;
      }

      try {
        tokenStore.set(token);
        const response = await apiRequest<{ user: User }>("/auth/me");
        auth.setUser(response.user);
        navigate(redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : routes.dashboard, {
          replace: true
        });
      } catch (caught) {
        tokenStore.clear();
        setError(caught instanceof Error ? caught.message : "Google authentication failed");
      }
    }

    void completeOAuthLogin();
  }, [auth, navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 dark:bg-slate-950">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold">Signing in</h1>
        {error ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </Card>
    </main>
  );
}
