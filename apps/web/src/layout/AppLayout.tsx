import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
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

export function AppLayout() {
  const auth = useAuth();
  const navigate = useNavigate();

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

  const logout = () => {
    auth.logout();
    navigate(routes.login);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink">FlowLedger</h1>
            <p className="text-sm text-slate-500">{auth.user ? auth.user.email : "Personal finance workspace"}</p>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1">
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
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
