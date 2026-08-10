import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { routes } from "../../constants/routes";
import { navItems } from "../config/navigation";
import { BrandLink } from "./BrandLink";
import { PrimaryNavLinks } from "./PrimaryNavLinks";

/** Persistent desktop sidebar: brand, primary nav, account link, and sign out — hidden below the `lg` breakpoint in favor of `MobileSidebarDrawer`/`MobileBottomNav`. */
export function AppSidebar({
  authUserName,
  onLogout
}: {
  authUserName?: string;
  onLogout: () => void;
}) {
  return (
    <aside className="hidden h-screen w-72 shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-0 lg:flex lg:flex-col">
      <div className="border-b border-slate-200 px-6 py-5 dark:border-slate-800">
        <BrandLink />
      </div>

      <nav
        className="flex-1 space-y-1 overflow-y-auto px-4 py-5"
        aria-label="Primary navigation"
      >
        <PrimaryNavLinks items={navItems} />
      </nav>

      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        {authUserName ? (
          <Link
            to={routes.profile}
            className="mb-3 block rounded-md px-3 py-2 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
            title={authUserName}
          >
            <span className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              Account
            </span>
            <span className="block truncate text-sm font-semibold text-pine dark:text-emerald-300">
              {authUserName}
            </span>
          </Link>
        ) : null}
        <div className="grid gap-3">
          <Button variant="secondary" onClick={onLogout} className="w-full">
            Sign out
          </Button>
        </div>
      </div>
    </aside>
  );
}
