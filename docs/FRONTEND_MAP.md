# Frontend Map

Source: `apps/web/src/`

---

## Entry point

`main.tsx` — Sets up:
- `QueryClientProvider` (TanStack Query)
- `BrowserRouter` (React Router)
- `AuthProvider` (custom auth context via `useAuth`)
- Theme application

---

## Routing

Routes are defined in `apps/web/src/constants/routes.ts`. The router wraps authenticated pages with `ProtectedRoute`, which redirects to `/login` if no token is found in localStorage.

| Route | Component | Auth |
|---|---|---|
| `/login` | `LoginPage` | No |
| `/register` | `RegisterPage` | No |
| `/auth/oauth/callback` | `OAuthCallbackPage` | No |
| `/` → redirect `/dashboard` | — | — |
| `/dashboard` | `DashboardPage` | Yes |
| `/transactions` | `TransactionsPage` | Yes |
| `/transactions/:id` | `TransactionDetailPage` | Yes |
| `/accounts` | `AccountsPage` | Yes |
| `/categories` | `CategoriesPage` | Yes |
| `/groups` | `GroupsPage` | Yes |
| `/shared-expenses` | `SharedExpensesPage` | Yes |
| `/debts` | `DebtsPage` | Yes |
| `/reports` | `ReportsPage` | Yes |
| `/profile` | `ProfilePage` | Yes |

Authenticated pages render inside `AppLayout`, which provides the sidebar navigation, header with notification bell, and mobile bottom nav.

---

## Pages

### LoginPage
- Email/password login form
- Google OAuth button (via `GoogleOAuthButton` → redirects to `/auth/google`)
- Link to `/register`
- On success: stores JWT in `tokenStore`, navigates to `/dashboard` (or redirect param)

### RegisterPage
- Name, email, password fields
- On success: stores JWT, navigates to `/dashboard`

### OAuthCallbackPage
- Reads `token` and `redirect` from URL hash fragment (set by API's Google OAuth callback)
- Stores token in `tokenStore`, navigates to redirect destination

### DashboardPage
- Queries: `GET /reports/summary`, `GET /reports/monthly-cashflow`, `GET /transactions` (first 5)
- Displays: income/expenses/balance metric cards, monthly cashflow area chart (Recharts), recent transactions list

### TransactionsPage
- Tabs: "Transactions" (regular) and "Imported" (provider review)
- **Transactions tab**: Filterable/searchable list. Date range, type, account, category, group filters. Transaction CRUD via modals.
- **Imported tab**: Lists `ProviderImportedTransaction` records with status filter (`pending`, `processed`, `ignored`). Supports per-row import/ignore, batch import/ignore. Category assignment before import.
- Queries: `GET /transactions`, `GET /transactions/imported`, `GET /transactions/imported/pending-count`

### TransactionDetailPage
- Full detail view for a single transaction
- Shows related transactions (TransactionRelation), linked shared expense and participants
- Edit and delete actions

### AccountsPage
- Lists all user accounts with computed balance and provider sync state
- Create, edit, archive/unarchive, delete accounts
- Provider account management: "Synced accounts" section shows `ProviderAccount` records
- Connect new provider account via the connection flow (opens Syncfy widget)
- Confirm/link provider accounts to FlowLedger accounts
- Queries: `GET /accounts`, `GET /providers/accounts`, `GET /providers/connectors`

### CategoriesPage
- Lists personal categories and group categories
- Create, edit, archive/unarchive, delete categories
- Color picker for category visualization in reports

### GroupsPage
- Lists groups the user belongs to or owns
- Create group, invite members by email, remove members
- View group categories and shared transactions per group
- Query: `GET /groups`

### SharedExpensesPage
- Lists shared expenses the user owns or participates in
- Create shared expense linked to a transaction
- Edit participants and share amounts

### DebtsPage
- Tabs: "I Owe", "Owed To Me", "Pending Settlements", "Settled"
- Lists debts with outstanding amounts
- Submit settlement request (debtor) or approve/reject (creditor)
- Direct settle action for creditors
- Query: `GET /debts`

### ReportsPage
- Date range and group/category filters
- Summary metrics card
- Category breakdown chart/table (Recharts bar or pie)
- Monthly cashflow area chart
- Queries: `GET /reports/summary`, `GET /reports/by-category`, `GET /reports/monthly-cashflow`

### ProfilePage
- Display and edit name, email
- Avatar upload / remove
- Theme toggle (light/dark)

---

## Layout

### AppLayout
- Desktop: fixed left sidebar (272px) with nav links + user info + sign out
- Mobile: top header bar + bottom navigation bar + slide-in drawer (left or right, user-configurable)
- Notification bell in header: polls unread count every 60s, shows imported pending count badge
- Notification dropdown: mark individual or all read, navigates to relevant page on click

### ProtectedRoute
- Checks for token in `tokenStore`
- Redirects to `/login?redirect=<current-path>` if no token

---

## Components

| Component | Purpose |
|---|---|
| `BrandLogo` | FlowLedger SVG logo |
| `Button` | Primary/secondary/destructive button with loading state |
| `Card` | Rounded bordered container |
| `FormField` | Label + input + error message wrapper |
| `GoogleIcon` | Google "G" SVG icon |
| `GoogleOAuthButton` | Button that initiates Google OAuth redirect |
| `ImportedTransactionCard` | Card for a single imported transaction row with import/ignore actions |
| `ImportedTransactionSelectionToolbar` | Batch selection toolbar (select all, batch import, batch ignore) |
| `SearchComponent` | Debounced search input |

---

## Hooks

| Hook | Purpose |
|---|---|
| `useAuth` | Auth context: `{ user, setUser, logout }`. Persists user in component state; token in localStorage. |
| `useTheme` | Light/dark theme: reads/writes `localStorage` preference, applies class to `<html>`. |
| `useMobileSidebarSide` | Stores user preference for mobile sidebar side (`"left"` or `"right"`) in localStorage. |

---

## Services

### `services/api.ts`

- `API_URL` — read from `VITE_API_URL` or falls back to `http://localhost:4000`
- `tokenStore` — get/set/clear JWT in `localStorage` under key `"flowledger.token"`
- `apiRequest<T>(path, options?)` — fetch wrapper that adds `Authorization` header, handles JSON body, throws `ApiError` on non-2xx responses
- `apiUrl(path)` — absolute URL for an API path
- `apiAssetUrl(path)` — returns absolute URL for assets (handles both relative and absolute paths)

---

## Utilities

### `utils/transactions.ts`
- `parseTransactionAmount(value)` — safely parses a transaction amount (returns 0 for invalid)
- `summarizeTransactions(transactions)` — sums income and expense amounts from a transaction list, excluding transfers. Used in TransactionsPage summary bar.

### `utils/search.ts`
- Client-side search utilities for filtering transactions and other lists locally.

---

## Types

### `types/api.ts`
Frontend TypeScript types that mirror API response shapes:
- `User`, `Account`, `Category`, `Transaction`, `Group`, `GroupMember`
- `SharedExpense`, `SharedExpenseParticipant`, `SettlementRequest`
- `Notification`, `ProviderAccount`, `ProviderImportedTransaction`
- `Summary`, `CashflowRow` (report types)

### `types/syncfy-authentication-widget-umd.d.ts`
Type shim for the Syncfy widget loaded as a UMD script at runtime from `SYNCFY_WIDGET_SCRIPT_URL`. The widget is loaded via a `<script>` tag in AccountsPage (not imported as a module).
