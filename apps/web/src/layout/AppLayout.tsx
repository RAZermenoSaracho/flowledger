import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { routes } from "../constants/routes";
import { useAuth } from "../hooks/useAuth";
import { useMobileSidebarSide } from "../hooks/useMobileSidebarSide";
import { useTheme } from "../hooks/useTheme";
import type { ThemePreference } from "../hooks/useTheme";
import { apiRequest, tokenStore } from "../services/api";
import type { Notification, User } from "../types/api";
import { Button } from "../components/Button";
import type { MobileSidebarSide } from "../hooks/useMobileSidebarSide";

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
  const queryClient = useQueryClient();
  const { preference, setPreference } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileSidebarSide] = useMobileSidebarSide();

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
          <NotificationsMenu queryClient={queryClient} />
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
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <BrandLink />
            <NotificationsMenu queryClient={queryClient} compact />
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
      />
    </div>
  );
}

function NotificationsMenu({
  compact,
  queryClient
}: {
  compact?: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCountQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () =>
      (await apiRequest<{ count: number }>("/notifications/unread-count")).count,
    refetchInterval: 60_000
  });
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    enabled: isOpen,
    queryFn: async () =>
      (await apiRequest<{ notifications: Notification[] }>("/notifications"))
        .notifications
  });
  const markRead = useMutation({
    mutationFn: (notificationId: string) =>
      apiRequest(`/notifications/${notificationId}/read`, { method: "PATCH" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });
  const markAllRead = useMutation({
    mutationFn: () => apiRequest("/notifications/read-all", { method: "PATCH" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  const unreadCount = unreadCountQuery.data ?? 0;
  const notifications = notificationsQuery.data ?? [];
  const isActing = markRead.isPending || markAllRead.isPending;

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <div className={`relative ${compact ? "" : "mb-3"}`}>
      <button
        type="button"
        className="relative inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
        aria-label="Notifications"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <BellIcon />
        {compact ? null : <span>Notifications</span>}
        {unreadCount > 0 ? (
          <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-pine px-1.5 py-0.5 text-center text-xs font-bold text-white dark:bg-emerald-500 dark:text-slate-950">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-ink dark:text-slate-100">
              Notifications
            </h2>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-semibold text-pine transition hover:bg-mint disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-300 dark:hover:bg-emerald-950"
              disabled={unreadCount === 0 || isActing}
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {notificationsQuery.isLoading ? (
              <p className="px-2 py-4 text-sm text-slate-500 dark:text-slate-400">
                Loading notifications.
              </p>
            ) : notifications.length === 0 ? (
              <p className="px-2 py-4 text-sm text-slate-500 dark:text-slate-400">
                No notifications yet.
              </p>
            ) : (
              <div className="grid gap-2">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`rounded-md border p-3 ${
                      notification.readAt
                        ? "border-slate-200 dark:border-slate-800"
                        : "border-pine bg-mint dark:border-emerald-600 dark:bg-emerald-950"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink dark:text-slate-100">
                          {notification.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {notification.message}
                        </p>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          {new Date(notification.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {!notification.readAt ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-pine transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-300 dark:hover:bg-slate-900"
                          disabled={isActing}
                          onClick={() => markRead.mutate(notification.id)}
                        >
                          Read
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
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
        aria-label="Navigation menu"
        className={`fixed bottom-20 top-0 z-40 flex w-[min(20rem,calc(100vw-2rem))] ${sideClasses} ${borderClasses} border-slate-200 bg-white shadow-xl transition-transform dark:border-slate-800 dark:bg-slate-900 ${
          isOpen ? "translate-x-0" : closedTransform
        }`}
      >
        <div className="flex min-h-0 w-full flex-col">
          <div className="flex justify-end border-b border-slate-200 px-4 py-3 dark:border-slate-800">
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
  onToggleDrawer
}: {
  isDrawerOpen: boolean;
  onNavigate: () => void;
  onLogout: () => void;
  onToggleDrawer: () => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-3 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-lg shadow-slate-950/10 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden"
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
