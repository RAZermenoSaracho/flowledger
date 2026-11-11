/** Central map of app route paths, keyed by page. */
export const routes = {
  dashboard: "/",
  login: "/login",
  register: "/register",
  oauthCallback: "/auth/oauth/callback",
  oauthAuthorize: "/oauth/authorize",
  transactions: "/transactions",
  newTransaction: "/transactions/new",
  transaction: (id: string) => `/transactions/${id}`,
  accounts: "/accounts",
  account: (id: string) => `/accounts/${id}`,
  categories: "/categories",
  groups: "/groups",
  group: (id: string) => `/groups/${id}`,
  reports: "/reports",
  debts: "/debts",
  profile: "/profile",
  developer: "/profile/developer"
} as const;
