import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import type { MobileExpandableNavConfig } from "../types/appLayout.types";

/** One expandable mobile-drawer nav item (Debts, Transactions): a toggle button revealing `config.subPages` as `?tab=` links on the item's own base route. Shared by every entry in `mobileExpandableNav` — extend that config rather than adding a parallel expand/collapse implementation. */
export function MobileExpandableNavItem({
  label,
  config,
  onNavigate
}: {
  label: string;
  config: MobileExpandableNavConfig;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const isOnBasePage = location.pathname === config.basePath;
  const activeTab = isOnBasePage
    ? (new URLSearchParams(location.search).get("tab") ?? config.defaultTab)
    : null;
  const [isExpanded, setIsExpanded] = useState(isOnBasePage);
  const panelId = `mobile-${config.basePath.replace(/\//g, "")}-subpages`;

  useEffect(() => {
    if (isOnBasePage) setIsExpanded(true);
  }, [isOnBasePage]);

  return (
    <div>
      <button
        type="button"
        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${
          isOnBasePage
            ? "bg-mint text-pine dark:bg-emerald-950 dark:text-emerald-200"
            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        }`}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span>{label}</span>
        <ChevronDown
          className={`h-4 w-4 transition ${isExpanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {isExpanded ? (
        <div
          id={panelId}
          className="ml-3 mt-1 grid gap-1 border-l border-slate-200 pl-3 dark:border-slate-700"
        >
          {config.subPages.map((subPage) => (
            <NavLink
              key={subPage.tab}
              to={`${config.basePath}?tab=${subPage.tab}`}
              onClick={onNavigate}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                activeTab === subPage.tab
                  ? "bg-mint text-pine dark:bg-emerald-950 dark:text-emerald-200"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {subPage.label}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}
