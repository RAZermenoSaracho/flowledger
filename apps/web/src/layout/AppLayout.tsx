import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { routes } from "../constants/routes";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import type { ThemePreference } from "../hooks/useTheme";
import { apiRequest, tokenStore } from "../services/api";
import type { User } from "../types/api";
import { Button } from "../components/Button";

const navItems = [
  ["Dashboard", routes.dashboard],
  ["Transactions", routes.transactions],
  ["Accounts", routes.accounts],
  ["Categories", routes.categories],
  ["Households", routes.households],
  ["Reports", routes.reports],
  ["Shared", routes.sharedExpenses],
  ["Debts", routes.debts]
] as const;

const mobileNavItems = navItems;

export function AppLayout() {
  const auth = useAuth();
  const { preference, setPreference } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useQuery({
    queryKey: ["me"],
    enabled: Boolean(tokenStore.get()) && !auth.user,
    queryFn: async () => {
      const response = await apiRequest<{ user: User }>("/auth/me");
      auth.setUser(response.user);
      return response.user;
    },
    retry: false
  });

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const logout = () => {
    setIsMobileMenuOpen(false);
    auth.logout();
    navigate(routes.login);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link
              to={routes.dashboard}
              className="rounded-md focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:focus:ring-offset-slate-950"
              aria-label="Go to Dashboard"
            >
              <h1 className="text-xl font-bold text-ink dark:text-slate-100">FlowLedger</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Personal finance workspace</p>
            </Link>
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-slate-200 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950 lg:hidden"
              aria-controls="mobile-navigation"
              aria-expanded={isMobileMenuOpen}
              aria-label="Toggle navigation menu"
              onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
            >
              <span aria-hidden="true" className="grid gap-1">
                <span className="block h-0.5 w-5 rounded bg-current" />
                <span className="block h-0.5 w-5 rounded bg-current" />
                <span className="block h-0.5 w-5 rounded bg-current" />
              </span>
              Menu
            </button>
            <div className="hidden items-center gap-4 lg:flex">
              <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Primary navigation">
                {navItems.map(([label, href]) => (
                  <NavLink
                    key={href}
                    to={href}
                    className={({ isActive }) =>
                      `whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
                        isActive
                          ? "bg-mint text-pine dark:bg-emerald-950 dark:text-emerald-200"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </nav>
              {auth.user ? (
                <Link
                  to={routes.profile}
                  className="max-w-40 truncate rounded-md px-3 py-2 text-sm font-semibold text-pine transition hover:bg-mint focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:text-emerald-300 dark:hover:bg-emerald-950 dark:focus:ring-offset-slate-950"
                  title={auth.user.name}
                >
                  {auth.user.name}
                </Link>
              ) : null}
              <ThemeSelector preference={preference} setPreference={setPreference} />
              <Button variant="secondary" onClick={logout}>
                Sign out
              </Button>
            </div>
          </div>

          <nav
            id="mobile-navigation"
            className={`${isMobileMenuOpen ? "grid" : "hidden"} mt-4 gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 lg:hidden`}
            aria-label="Mobile navigation"
          >
            {mobileNavItems.map(([label, href]) => (
              <NavLink
                key={href}
                to={href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${
                    isActive
                      ? "bg-mint text-pine dark:bg-emerald-950 dark:text-emerald-200"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
            {auth.user ? (
              <NavLink
                to={routes.profile}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-semibold ${
                    isActive
                      ? "bg-mint text-pine dark:bg-emerald-950 dark:text-emerald-200"
                      : "text-pine hover:bg-slate-100 dark:text-emerald-300 dark:hover:bg-slate-800"
                  }`
                }
              >
                {auth.user.name}
              </NavLink>
            ) : null}
            <ThemeSelector preference={preference} setPreference={setPreference} />
            <Button variant="secondary" onClick={logout} className="justify-self-start">
              Sign out
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

function ThemeSelector({
  preference,
  setPreference
}: {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}) {
  return (
    <label className="inline-flex w-full items-center sm:w-auto">
      <span className="sr-only">Theme</span>
      <select
        aria-label="Theme preference"
        className="min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-50 focus:border-pine focus:ring-2 focus:ring-mint dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 dark:focus:ring-emerald-900 sm:w-32"
        value={preference}
        onChange={(event) => setPreference(event.target.value as ThemePreference)}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
