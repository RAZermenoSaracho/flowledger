import { routes } from "../../constants/routes";
import type { MobileExpandableNavConfig } from "../types/appLayout.types";

/** Primary nav links shared by the desktop sidebar and the mobile drawer. */
export const navItems = [
  ["Dashboard", routes.dashboard],
  ["Transactions", routes.transactions],
  ["Accounts", routes.accounts],
  ["Categories", routes.categories],
  ["Groups", routes.groups],
  ["Reports", routes.reports],
  ["Debts", routes.debts]
] as const;

// Mirrors DebtsPage's own `debtsTabs`/TransactionsPage's own tab ids (kept
// as separate literal lists rather than imports: the app shell isn't a
// dependency of either page module, matching how `notificationTarget`
// targets these same `?tab=` values without importing from pages/Debts or
// pages/Transactions).
const debtsMobileSubPages = [
  { tab: "balances", label: "Outstanding Balances" },
  { tab: "pending", label: "Pending Settlement Requests" },
  { tab: "settled", label: "Settled History" },
  { tab: "sharedExpenses", label: "Shared Expenses" }
] as const;

const transactionsMobileSubPages = [
  { tab: "transactions", label: "Transactions" },
  { tab: "imported", label: "Imported Transactions" }
] as const;

// Keyed by route path — every entry here renders as an expandable dropdown
// in the mobile drawer instead of a plain link; every other item in
// `navItems` stays a plain link. Desktop nav (`PrimaryNavLinks`) is
// unaffected — this config only feeds `MobilePrimaryNavLinks`.
export const mobileExpandableNav: Record<string, MobileExpandableNavConfig> = {
  [routes.debts]: {
    basePath: routes.debts,
    defaultTab: "balances",
    subPages: debtsMobileSubPages
  },
  [routes.transactions]: {
    basePath: routes.transactions,
    defaultTab: "transactions",
    subPages: transactionsMobileSubPages
  }
};
