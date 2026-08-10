import { NavLink } from "react-router-dom";
import { routes } from "../../constants/routes";

/** Fixed bottom action bar shown below the `lg` breakpoint: quick links to Dashboard/Profile plus the toggle for `MobileSidebarDrawer`. */
export function MobileBottomNav({
  isDrawerOpen,
  onNavigate,
  onToggleDrawer
}: {
  isDrawerOpen: boolean;
  onNavigate: () => void;
  onToggleDrawer: () => void;
}) {
  const navActionClasses =
    "mx-1 flex h-12 min-w-12 items-center justify-center rounded-md transition focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:focus:ring-offset-slate-950";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-3 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-lg shadow-slate-950/10 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden"
      aria-label="Mobile primary actions"
    >
      <NavLink
        to={routes.dashboard}
        onClick={onNavigate}
        aria-label="Dashboard"
        className={({ isActive }) =>
          `${navActionClasses} ${
            isActive
              ? "bg-mint text-pine dark:bg-emerald-950 dark:text-emerald-200"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`
        }
      >
        <HomeIcon />
      </NavLink>
      <NavLink
        to={routes.profile}
        onClick={onNavigate}
        aria-label="Profile"
        className={({ isActive }) =>
          `${navActionClasses} ${
            isActive
              ? "bg-mint text-pine dark:bg-emerald-950 dark:text-emerald-200"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`
        }
      >
        <UserIcon />
      </NavLink>
      <button
        type="button"
        className={`${navActionClasses} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`}
        aria-label={
          isDrawerOpen ? "Close navigation menu" : "Open navigation menu"
        }
        aria-controls="mobile-sidebar"
        aria-expanded={isDrawerOpen}
        onClick={onToggleDrawer}
      >
        {isDrawerOpen ? <CloseIcon /> : <MenuIcon />}
      </button>
    </nav>
  );
}

function HomeIcon() {
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
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function UserIcon() {
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
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MenuIcon() {
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
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
