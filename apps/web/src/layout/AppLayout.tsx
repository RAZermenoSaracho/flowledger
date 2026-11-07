import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { MobileSidebarSide } from "@flowledger/shared";
import { routes } from "../constants/routes";
import { useAuth } from "../hooks/useAuth";
import { AppHeader } from "./components/AppHeader";
import { AppSidebar } from "./components/AppSidebar";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { MobileSidebarDrawer } from "./components/MobileSidebarDrawer";
import { navItems } from "./config/navigation";

/** Top-level authenticated app shell: sidebar/nav, notifications, and routed content. */
export function AppLayout() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileSidebarSide: MobileSidebarSide =
    auth.user?.mobileSidebarSide ?? "left";

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
    void auth.logout();
    navigate(routes.login);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 [--mobile-bottom-nav-height:4.0625rem] [--mobile-top-nav-height:5rem] dark:bg-slate-950 lg:flex lg:pb-0">
      <AppSidebar authUserName={auth.user?.name} onLogout={logout} />

      <div className="min-w-0 flex-1">
        <AppHeader />
        {/* `overflow-x-clip` (not `-hidden`) on purpose: `hidden` on one axis
            forces the other axis from `visible` to `auto`, turning <main>
            into a scroll container that clips absolutely positioned menus
            and nests a scroll inside the document's (an iOS Safari
            `position: fixed` hazard). `clip` leaves the y axis visible. */}
        <main className="mx-auto max-w-7xl min-w-0 overflow-x-clip px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      <MobileSidebarDrawer
        authUserName={auth.user?.name}
        isOpen={isMobileMenuOpen}
        items={navItems}
        onClose={() => setIsMobileMenuOpen(false)}
        onLogout={logout}
        side={mobileSidebarSide}
      />

      <MobileBottomNav
        isDrawerOpen={isMobileMenuOpen}
        onNavigate={() => setIsMobileMenuOpen(false)}
        onToggleDrawer={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
      />
    </div>
  );
}
