import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { routes } from "../constants/routes";
import { useAuth } from "../hooks/useAuth";
import { apiRequest, tokenStore } from "../services/api";
import type { User } from "../types/api";
import { Button } from "../components/Button";

const navItems = [
  ["Dashboard", routes.dashboard],
  ["Transactions", routes.transactions],
  ["Accounts", routes.accounts],
  ["Categories", routes.categories],
  ["Reports", routes.reports],
  ["Shared", routes.sharedExpenses]
] as const;

const mobileNavItems = [...navItems, ["Profile", routes.profile]] as const;

export function AppLayout() {
  const auth = useAuth();
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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-ink">FlowLedger</h1>
              <p className="text-sm text-slate-500">{auth.user ? auth.user.email : "Personal finance workspace"}</p>
            </div>
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-slate-200 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 lg:hidden"
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
                        isActive ? "bg-mint text-pine" : "text-slate-600 hover:bg-slate-100"
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </nav>
              <Button variant="secondary" onClick={logout}>
                Sign out
              </Button>
            </div>
          </div>

          <nav
            id="mobile-navigation"
            className={`${isMobileMenuOpen ? "grid" : "hidden"} mt-4 gap-2 border-t border-slate-200 pt-4 lg:hidden`}
            aria-label="Mobile navigation"
          >
            {mobileNavItems.map(([label, href]) => (
              <NavLink
                key={href}
                to={href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${
                    isActive ? "bg-mint text-pine" : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
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
