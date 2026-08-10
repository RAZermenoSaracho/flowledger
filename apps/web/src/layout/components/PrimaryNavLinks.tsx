import { NavLink } from "react-router-dom";

/** Desktop sidebar nav links: plain links to each top-level route, active-state highlighted. */
export function PrimaryNavLinks({
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
