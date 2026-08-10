import { NavLink } from "react-router-dom";
import { mobileExpandableNav } from "../config/navigation";
import { MobileExpandableNavItem } from "./MobileExpandableNavItem";

/** Mobile-drawer nav links: identical to the desktop sidebar's, except items in `mobileExpandableNav` (Debts, Transactions) expand in place into their `?tab=` sub-pages instead of linking straight to the page — the in-page tab switcher on those pages is desktop-only (see DebtsPage.tsx/TransactionsPage.tsx). */
export function MobilePrimaryNavLinks({
  items,
  onNavigate
}: {
  items: readonly (readonly [string, string])[];
  onNavigate?: () => void;
}) {
  return (
    <>
      {items.map(([label, href]) => {
        const expandable = mobileExpandableNav[href];
        if (!expandable) {
          return (
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
          );
        }

        return (
          <MobileExpandableNavItem
            key={href}
            label={label}
            config={expandable}
            onNavigate={onNavigate}
          />
        );
      })}
    </>
  );
}
