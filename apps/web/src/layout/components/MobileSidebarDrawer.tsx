import type { MobileSidebarSide } from "@flowledger/shared";
import { NavLink } from "react-router-dom";
import { Button } from "../../components/Button";
import { routes } from "../../constants/routes";
import { MobilePrimaryNavLinks } from "./MobilePrimaryNavLinks";

/** Full-navigation mobile drawer: slides in from `side`, closes on backdrop click/Escape/route change (all handled by the caller), and mirrors the desktop sidebar's links plus the account/sign-out footer. */
export function MobileSidebarDrawer({
  authUserName,
  isOpen,
  items,
  onClose,
  onLogout,
  side
}: {
  authUserName?: string;
  isOpen: boolean;
  items: readonly (readonly [string, string])[];
  onClose: () => void;
  onLogout: () => void;
  side: MobileSidebarSide;
}) {
  const sideClasses = side === "left" ? "left-0" : "right-0";
  const borderClasses = side === "left" ? "border-r" : "border-l";
  const closedTransform =
    side === "left" ? "-translate-x-full" : "translate-x-full";

  return (
    <div className={`${isOpen ? "block" : "hidden"} lg:hidden`}>
      <button
        type="button"
        className="fixed inset-x-0 bottom-[var(--mobile-bottom-nav-height)] top-[var(--mobile-top-nav-height)] z-30 cursor-default bg-slate-950/40"
        aria-label="Close sidebar"
        onClick={onClose}
      />
      <aside
        id="mobile-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed bottom-[var(--mobile-bottom-nav-height)] top-[var(--mobile-top-nav-height)] z-40 flex w-[min(20rem,calc(100vw-2rem))] overflow-hidden overscroll-contain ${sideClasses} ${borderClasses} border-slate-200 bg-white shadow-xl transition-transform dark:border-slate-800 dark:bg-slate-900 ${
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

          <nav
            className="flex-1 space-y-1 overflow-y-auto px-4 py-5"
            aria-label="Mobile full navigation"
          >
            <MobilePrimaryNavLinks items={items} onNavigate={onClose} />
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
            <Button variant="secondary" onClick={onLogout} className="w-full">
              Sign out
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
