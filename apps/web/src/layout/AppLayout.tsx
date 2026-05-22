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

type MobileSidebarSide = "left" | "right";

const mobileSidebarSideKey = "flowledger.mobileSidebarSide";

const navItems = [
  ["Dashboard", routes.dashboard],
  ["Transactions", routes.transactions],
  ["Accounts", routes.accounts],
  ["Categories", routes.categories],
  ["Households", routes.households],
  ["Reports", routes.reports],
  ["Shared Expenses", routes.sharedExpenses],
  ["Debts", routes.debts]
] as const;

const mobileNavItems = navItems;

export function AppLayout() {
  const auth = useAuth();
  const { preference, setPreference } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileSidebarSide, setMobileSidebarSide] = useState<MobileSidebarSide>(() => {
    if (typeof window === "undefined") return "left";

    return window.localStorage.getItem(mobileSidebarSideKey) === "right" ? "right" : "left";
  });

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

  useEffect(() => {
    window.localStorage.setItem(mobileSidebarSideKey, mobileSidebarSide);
  }, [mobileSidebarSide]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMobileMenuOpen]);

  const logout = () => {
    setIsMobileMenuOpen(false);
    auth.logout();
    navigate(routes.login);
  };

  const toggleMobileSidebarSide = () => {
    setMobileSidebarSide((side) => (side === "left" ? "right" : "left"));
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 dark:bg-slate-950 lg:flex lg:pb-0">
      <aside className="hidden h-screen w-72 shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-0 lg:flex lg:flex-col">
        <div className="border-b border-slate-200 px-6 py-5 dark:border-slate-800">
          <BrandLink />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5" aria-label="Primary navigation">
          <PrimaryNavLinks items={navItems} />
        </nav>

        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          {auth.user ? (
            <Link
              to={routes.profile}
              className="mb-3 block rounded-md px-3 py-2 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
              title={auth.user.name}
            >
              <span className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                Account
              </span>
              <span className="block truncate text-sm font-semibold text-pine dark:text-emerald-300">
                {auth.user.name}
              </span>
            </Link>
          ) : null}
          <div className="grid gap-3">
            <ThemeSelector preference={preference} setPreference={setPreference} />
            <Button variant="secondary" onClick={logout} className="w-full">
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:hidden">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
            <BrandLink />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      <MobileSidebarDrawer
        authUserName={auth.user?.name}
        isOpen={isMobileMenuOpen}
        items={mobileNavItems}
        onClose={() => setIsMobileMenuOpen(false)}
        onLogout={logout}
        preference={preference}
        setPreference={setPreference}
        side={mobileSidebarSide}
      />

      <MobileBottomNav
        isDrawerOpen={isMobileMenuOpen}
        onNavigate={() => setIsMobileMenuOpen(false)}
        onLogout={logout}
        onToggleDrawer={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
        onToggleSide={toggleMobileSidebarSide}
        side={mobileSidebarSide}
      />
    </div>
  );
}

function BrandLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      to={routes.dashboard}
      onClick={onNavigate}
      className="inline-block rounded-md focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:focus:ring-offset-slate-950"
      aria-label="Go to Dashboard"
    >
      <h1 className="text-xl font-bold text-ink dark:text-slate-100">FlowLedger</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">Personal finance workspace</p>
    </Link>
  );
}

function MobileSidebarDrawer({
  authUserName,
  isOpen,
  items,
  onClose,
  onLogout,
  preference,
  setPreference,
  side
}: {
  authUserName?: string;
  isOpen: boolean;
  items: readonly (readonly [string, string])[];
  onClose: () => void;
  onLogout: () => void;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  side: MobileSidebarSide;
}) {
  const sideClasses = side === "left" ? "left-0" : "right-0";
  const borderClasses = side === "left" ? "border-r" : "border-l";
  const closedTransform = side === "left" ? "-translate-x-full" : "translate-x-full";

  return (
    <div className={`${isOpen ? "block" : "hidden"} lg:hidden`}>
      <button
        type="button"
        className="fixed inset-x-0 bottom-20 top-0 z-30 cursor-default bg-slate-950/40"
        aria-label="Close sidebar"
        onClick={onClose}
      />
      <aside
        id="mobile-sidebar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-sidebar-title"
        className={`fixed bottom-20 top-0 z-40 flex w-[min(20rem,calc(100vw-2rem))] ${sideClasses} ${borderClasses} border-slate-200 bg-white shadow-xl transition-transform dark:border-slate-800 dark:bg-slate-900 ${
          isOpen ? "translate-x-0" : closedTransform
        }`}
      >
        <div className="flex min-h-0 w-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
            <div id="mobile-sidebar-title">
              <BrandLink onNavigate={onClose} />
            </div>
            <button
              type="button"
              className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5" aria-label="Mobile full navigation">
            <PrimaryNavLinks items={items} onNavigate={onClose} />
            {authUserName ? (
              <NavLink
                to={routes.profile}
                onClick={onClose}
                className={({ isActive }) =>
                  `mt-2 block rounded-md px-3 py-2 text-sm font-semibold ${
                    isActive
                      ? "bg-mint text-pine dark:bg-emerald-950 dark:text-emerald-200"
                      : "text-pine hover:bg-slate-100 dark:text-emerald-300 dark:hover:bg-slate-800"
                  }`
                }
              >
                {authUserName}
              </NavLink>
            ) : null}
          </nav>

          <div className="grid gap-3 border-t border-slate-200 p-4 dark:border-slate-800">
            <ThemeSelector preference={preference} setPreference={setPreference} />
            <Button variant="secondary" onClick={onLogout} className="w-full">
              Sign out
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function MobileBottomNav({
  isDrawerOpen,
  onNavigate,
  onLogout,
  onToggleDrawer,
  onToggleSide,
  side
}: {
  isDrawerOpen: boolean;
  onNavigate: () => void;
  onLogout: () => void;
  onToggleDrawer: () => void;
  onToggleSide: () => void;
  side: MobileSidebarSide;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-lg shadow-slate-950/10 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden"
      aria-label="Mobile primary actions"
    >
      <NavLink
        to={routes.dashboard}
        onClick={onNavigate}
        className={({ isActive }) =>
          `mx-1 flex min-h-12 flex-col items-center justify-center rounded-md px-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:focus:ring-offset-slate-950 ${
            isActive
              ? "bg-mint text-pine dark:bg-emerald-950 dark:text-emerald-200"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`
        }
      >
        Dashboard
      </NavLink>
      <button
        type="button"
        className="mx-1 flex min-h-12 flex-col items-center justify-center rounded-md px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
        onClick={onLogout}
      >
        Sign out
      </button>
      <button
        type="button"
        className="mx-1 flex min-h-12 flex-col items-center justify-center rounded-md px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
        aria-label={`Open sidebar from the ${side === "left" ? "right" : "left"} side`}
        onClick={onToggleSide}
      >
        {side === "left" ? "Left side" : "Right side"}
      </button>
      <button
        type="button"
        className="mx-1 flex min-h-12 flex-col items-center justify-center rounded-md px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
        aria-controls="mobile-sidebar"
        aria-expanded={isDrawerOpen}
        onClick={onToggleDrawer}
      >
        {isDrawerOpen ? "Close menu" : "Open menu"}
      </button>
    </nav>
  );
}

function PrimaryNavLinks({
  items,
  onNavigate
}: {
  items: readonly (readonly [string, string])[];
  onNavigate?: () => void;
}) {
  return (
    <>
      {items.map(([label, href]) => (
        <NavLink
          key={href}
          to={href}
          onClick={onNavigate}
          className={({ isActive }) =>
            `block rounded-md px-3 py-2 text-sm font-medium ${
              isActive
                ? "bg-mint text-pine dark:bg-emerald-950 dark:text-emerald-200"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </>
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
