import { FormEvent, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { BrandLogo } from "../../components/BrandLogo";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { TextInput } from "../../components/FormField";
import { GoogleOAuthButton } from "../../components/GoogleOAuthButton";
import { routes } from "../../constants/routes";
import { useAuth } from "../../hooks/useAuth";
import { safeRedirect } from "../../utils/safeRedirect";

/** Email/password and Google OAuth login form; a signed-in user goes straight to the same-origin `?redirect=` path, else the dashboard. */
export function LoginPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const redirect = safeRedirect(searchParams.get("redirect"), routes.dashboard);
  const oauthError = new URLSearchParams(window.location.search).get("oauthError");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [error, setError] = useState<string | null>(oauthError);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await auth.login(email, password, keepLoggedIn);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    }
  }

  if (auth.isInitializing) return null;
  if (auth.user) return <Navigate to={redirect} replace />;

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 dark:bg-slate-950">
      <Card className="w-full max-w-md">
        <BrandLogo className="mb-6 h-12 w-auto" />
        <h1 className="text-2xl font-bold">Sign in</h1>
        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <TextInput label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <TextInput
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
            <input
              className="h-4 w-4 accent-pine"
              type="checkbox"
              checked={keepLoggedIn}
              onChange={(event) => setKeepLoggedIn(event.target.checked)}
            />
            Keep me logged in on this device
          </label>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <Button type="submit">Sign in</Button>
        </form>
        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          or
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>
        <GoogleOAuthButton redirect={redirect} keepLoggedIn={keepLoggedIn} />
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          New to FlowLedger?{" "}
          <Link className="font-semibold text-pine dark:text-emerald-300" to={routes.register}>
            Create an account
          </Link>
        </p>
      </Card>
    </main>
  );
}
