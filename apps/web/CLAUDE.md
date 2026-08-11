# apps/web — Claude Code Guide

React + Vite SPA. Runs on port 5173 (dev) / 5174 (preview). The user-facing frontend for FlowLedger.

See the root `CLAUDE.md` for monorepo-level constraints, secrets policy, and branch rules.

---

## Comment standard

Full standard lives in root `CLAUDE.md`'s "Comment standard" section — read it before writing or editing any code here. Summary: every exported function/component/hook/type requires a `/** ... */` TSDoc block; an inline `//` is only for a genuinely non-obvious *why*; never narrate a fix or session ("fixed this", "this now correctly...") or restate the next line.

---

## Stack

| Layer | Tech |
|---|---|
| Build | Vite |
| Framework | React 18 |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Data fetching | TanStack Query v5 (`@tanstack/react-query`) |
| Routing | React Router v6 |
| Charts | Recharts |
| Auth | JWT access token in-memory via `tokenStore`, httpOnly cookie for silent refresh |
| Testing | Vitest, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `msw` |

---

## App entry point

`src/main.tsx` sets up the provider tree: `QueryClientProvider` → `ThemeProvider` → `AuthProvider` → `BrowserRouter` → routes.

---

## Routing and page structure

Routes are typed constants in `src/constants/routes.ts`. The router wraps authenticated pages with `<ProtectedRoute>` (inside `<AppLayout>`).

| Route | Page component | Auth |
|---|---|---|
| `/login` | `LoginPage` | No |
| `/register` | `RegisterPage` | No |
| `/auth/oauth/callback` | `OAuthCallbackPage` | No |
| `/` (index) | `DashboardPage` | Yes |
| `/transactions` | `TransactionsPage` | Yes |
| `/transactions/:id` | `TransactionDetailPage` | Yes |
| `/transactions/:id/edit` | `TransactionEditPage` | Yes |
| `/accounts` | `AccountsPage` | Yes |
| `/categories` | `CategoriesPage` | Yes |
| `/groups` | `GroupsPage` | Yes |
| `/debts` | `DebtsPage` | Yes |
| `/reports` | `ReportsPage` | Yes |
| `/profile` | `ProfilePage` | Yes |

`ProtectedRoute` checks `getToken()` (from `services/auth.client.ts`) and redirects to `/login?redirect=<path>` if no token is present.

---

## API calls — per-module clients in `services/`

`src/services/api.client.ts` holds the one low-level fetch layer (`apiRequest`, `tokenStore`, `ApiError`, `apiUrl`, `apiAssetUrl`). **`services/api.client.ts` must only ever be imported by files inside `services/` — never directly by a page, component, or hook.** This applies to every export, not just `apiRequest`: `tokenStore` is wrapped by `auth.client.ts` (`getToken`/`setToken`/`clearToken`), `apiAssetUrl` is wrapped by `users.client.ts` (`getAvatarUrl`), and `ApiError` is only ever caught inside a `.client.ts` function, which normalizes it into a plain return value (e.g. `transactions.client.ts`'s `getBatchErrors`) rather than leaking the error class itself to a page. If a page needs to inspect an error to make a decision, that decision belongs in the client or the backend, not the page. Every backend module has a matching `services/<module>.client.ts` that wraps it — **every file in `services/` follows the `<name>.client.ts` naming pattern, including the low-level fetch layer itself**:

```
services/
  api.client.ts             apiRequest/tokenStore/ApiError/apiUrl/apiAssetUrl — the only fetch layer
  accounts.client.ts        accounts CRUD + provider connections (Syncfy: connectors,
                             institutions, connections, provider-account confirm/resync,
                             credential refresh) — grouped here because provider syncing
                             exists to sync FlowLedger accounts, mirroring the backend's
                             accounts module
  auth.client.ts            login/register/me + googleOAuthUrl() link builder
  categories.client.ts      categories CRUD + list (supports scope:"all" for personal+group merge)
  currencies.client.ts      currency list (fiat/crypto grouped) + exchange rate lookup
  debts.client.ts           debts list (includes server-computed balances), settlement
                             request/approve/reject, batch settlement request/approval
  groups.client.ts          groups CRUD, members, nested group categories
  notifications.client.ts   list/unread-count/mark-read/mark-all-read
  reports.client.ts         summary/by-category/monthly-cashflow
  sharedExpenses.client.ts  shared-expenses CRUD
  transactions.client.ts    transactions CRUD + provider-imported-transaction review workflow
  users.client.ts           profile, avatar, password, plan, sidebar side, user search
```

**Rule: a `<module>.client.ts` file contains ONLY request-building and API-calling
logic** — building the path/query/body and calling `apiRequest`. No filtering,
sorting, grouping, or computed aggregates. That logic lives in the backend's
`read.service.ts` (see `apps/api/CLAUDE.md`) and is exposed through query
parameters (`sortBy`, `sortDirection`, facet filters, `scope`, `amountMode`,
etc.) that the client function forwards.

```ts
import { apiRequest } from "./api.client";
import type { Account } from "../types/accounts.types";

export function listAccounts(params: { includeArchived?: boolean; sortBy?: "name" | "createdAt" } = {}) {
  return apiRequest<{ accounts: Account[] }>("/accounts", {
    query: { includeArchived: params.includeArchived ? "true" : undefined, sortBy: params.sortBy }
  });
}
```

Pages import the client, not `apiRequest`:

```ts
import { listAccounts, createAccount } from "../services/accounts.client";

const accountsQuery = useQuery({
  queryKey: ["accounts", sortBy],
  queryFn: () => listAccounts({ sortBy }).then((r) => r.accounts)
});
```

When a provider (Syncfy, Google, Binance/Frankfurter) has its own routes, its calls live in
the client of the module that owns it on the backend — check `apps/api/CLAUDE.md`'s
"Providers" section for which module that is. Don't invent a separate `<provider>.client.ts`
unless the frontend actually calls that provider's routes independently of its owning module.

---

## Types

Types live next to the thing that owns them, at two levels:

### Global API response types — `src/types/<client>.types.ts`

One file per `services/<client>.client.ts`, holding the response shapes that client returns
(`Account`/`AccountSync` in `accounts.types.ts`, `Transaction`/`ProviderImportedTransaction` in
`transactions.types.ts`, etc.). A type goes in the file of whichever client owns that resource,
even if other clients' types reference it — e.g. `Group` lives in `groups.types.ts` and
`Transaction` (in `transactions.types.ts`) imports it for `Transaction.group`, not the other way
around. There is no catch-all `api.ts`/`api.types.ts` — if you're about to add a type there, put
it in the owning client's file instead. A `common.types.ts` is reserved for genuinely
cross-cutting shapes with no single owning client (e.g. a shared pagination envelope) — most
new types are not this; default to a specific client's file.

```ts
// types/accounts.types.ts
export type Account = { id: string; name: string; /* ... */ sync?: AccountSync[] };
export type AccountSync = { id: string; provider: string; /* ... */ };
```

### Page-module-local types — `pages/<Name>/types/<name>.types.ts`

Every page module that defines its own types (form state, tab unions, prop shapes not reused
elsewhere) collects them into a single `types/<pageName>.types.ts` file, named for the module in
`camelCase` (e.g. `pages/Accounts/types/accounts.types.ts`,
`pages/Transactions/types/transactions.types.ts` — note this is a different file from the global
`src/types/transactions.types.ts`; the page-local one holds UI-only types like
`TransactionFormState`, the global one holds the `Transaction` API shape). Only named
`type`/`interface` declarations move here — an inline prop-shape annotation directly in a
component's function signature (`{ prop }: { prop: string }`) is not something to extract into a
named type just to relocate it. If a page module has no named types of its own, it doesn't get a
`types/` folder — same "only if genuinely needed" rule as `utils/`.

---

## Data fetching pattern

All server state uses TanStack Query, always via a `<module>.client.ts` function — never an inline `apiRequest` call in a page or component:

```ts
// Query
const { data } = useQuery({
  queryKey: ['resource', id],
  queryFn: () => getResource(id),
});

// Mutation with cache invalidation
const mutation = useMutation({
  mutationFn: (body: Payload) => createResource(body),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resource'] }),
});
```

### What belongs in a page vs. the backend

- **Backend (`read.service.ts`, via query params passed through the client function):** filtering by any facet (status, type, category, account, group, currency, date range, amount range), sorting, computed aggregates (totals, balances, per-person netting, report rows with derived fields/colors).
- **Page/component (local state, presentational):** which UI panel is open, free-text search-box narrowing of an already-fetched list (search is otherwise server-side wherever the backend supports it), grouping already-sorted results into collapsible UI sections (no aggregation, just bucketing for rendering), unsaved form/draft state (e.g. a shared-expense split being built before save), excluding an already-selected option from a dropdown.

If you find yourself writing `.filter()` / `.sort()` / `.reduce()` over `queryKey` data to compute something other than presentational bucketing, check whether the backend already exposes a parameter for it before reaching for client-side logic — most list endpoints support `sortBy`/`sortDirection` and facet filters (including multi-select array filters, e.g. `typeIds`/`categoryIds` on `/transactions`).

---

## Component and hook conventions

- Pages: one folder per page module under `src/pages/<Name>/` — see "Page-module folder structure" below
- Shared UI primitives: `src/components/<Name>.tsx` — see "What belongs globally vs. in a page module" below for the bar
- Custom hooks shared across page modules: `src/hooks/use<Name>.tsx` or `.ts`
- Layout wrappers: `src/layout/<Name>.tsx`
- Styling: Tailwind utility classes only — no inline `style` props, no CSS modules
- No component-level `fetch` or `apiRequest` calls — always go through a `services/<module>.client.ts` function via TanStack Query

### Page-module folder structure

Every page lives in its own folder under `src/pages/`, named for the module (`PascalCase`, matches the page component minus the `Page` suffix):

```
pages/<Name>/
  <Name>Page.tsx          the page component, exported as a named export (PascalCase)
  <OtherPage>.tsx          additional top-level pages that belong to the same module
                            (e.g. Transactions/ also holds TransactionDetailPage.tsx
                            and TransactionEditPage.tsx)
  components/              UI pieces extracted from this page that are specific to it —
                            not reused by any other page module
  hooks/                   stateful logic (state + mutations + queries) extracted from
                            this page when a section's state/handlers are substantial
                            enough to clutter the page file — e.g.
                            Transactions/hooks/useImportedTransactionsWorkflow.ts,
                            Debts/hooks/useDebtSettlementWorkflow.ts. Only add this folder
                            if the extraction is genuinely warranted; small pages don't
                            need it.
  types/                   named type/interface declarations used within this page module
                            (form state shapes, tab unions, prop types), collected into a
                            single types/<pageName>.types.ts file — see "Types" above. Only
                            add this folder if the page module actually declares named types
                            of its own; don't create an empty placeholder.
  utils/                   pure presentation-only helpers specific to this page (date/
                            enum-to-label formatting, etc.) — only if genuinely needed.
                            If something here starts to look like filtering, sorting,
                            or business logic, it belongs in the backend's
                            `read.service.ts` instead, not in a frontend utils/ file.
```

Apply this folder pattern to every page, even small ones, for consistency. A page file should end up being primarily composition — importing and arranging its `components/` (and calling its `hooks/`) — not one large JSX tree with all the logic inline. Only put something in a page's `components/`, `hooks/`, `types/`, or `utils/` folder if it is genuinely specific to that page/module; anything reusable belongs in the top-level `components/`/`hooks/`/`types/` instead.

### What belongs globally vs. in a page module

For `components/`, `hooks/`, and `utils/` (top-level `src/` vs. a page's local folder), the bar
is usage, not potential:

- **Used by 2+ page modules, or by app-shell code** (`layout/`, `hooks/`, `main.tsx`) → belongs
  in the top-level `src/components/`, `src/hooks/`, or `src/utils/`. This includes something used
  by only one page module *directly* but reused transitively through an already-global component
  (e.g. `GoogleIcon.tsx` is only imported by `GoogleOAuthButton.tsx`, but that button is used by
  both the Login and Register pages, so the icon stays global too).
- **Used by exactly one page module** → belongs in that page's own `components/`/`hooks/`/`utils/`,
  not the top-level folder — move it there rather than leaving it global "in case" something else
  needs it later. `pages/Transactions/utils/transactions.ts` (`parseTransactionAmount`) is an
  example: nothing outside `Transactions/components/TransactionList.tsx` uses it.
- **Not imported anywhere** → don't silently delete it; it may be dead code or something meant to
  be wired up and never was. Flag it instead.

Current shared components living in `src/components/`: `Card`, `Button`, `FormField` (TextInput/SelectField/TextArea), `RecordCard` (list-row layout with mobile three-dot actions), `SearchBar`/`FilterBuilder` (the query-building UI), `AddRecordButton`, `PageHeader` (title+action row above a full-width `SearchBar`), `ActionMenu`. A new component belongs here only once a second page module actually needs it — see the bar above; don't add to this list preemptively.

**Target: no page-module file over ~500 lines.** When a page grows past that, look first for filtering/sorting/grouping/calculation logic that's still living client-side (move it to the backend's `read.service.ts`), then extract the remaining UI sections into `components/`, and pull mutation/query/state clusters into a `hooks/` file if a single section's state management is large enough to be its own concern (e.g. an entire tab's CRUD workflow).

### Adding a new page

1. Create `src/pages/<Name>/<Name>Page.tsx` with a named export
2. Add a route constant to `src/constants/routes.ts`
3. Add the `<Route>` in `src/main.tsx` (inside the `<ProtectedRoute>` wrapper if auth-required), importing from `./pages/<Name>/<Name>Page`
4. If auth-required: it will render inside `AppLayout` automatically
5. If the page needs backend data, add the calls to the relevant `services/<module>.client.ts` (create the file if the module doesn't have one yet) rather than calling `apiRequest` inline

### Adding a new component

- Specific to one page module: `src/pages/<Name>/components/<Component>.tsx`
- Reused by more than one page module: `src/components/<Name>.tsx`

Export named. Use existing primitives (`Button`, `Card`, `FormField`) before creating new ones.

---

## Auth context

`useAuth` (from `src/hooks/useAuth.tsx`) provides `{ user, setUser, logout }`. On login, store the JWT via `auth.client.ts`'s `setToken(token)` and call `setUser(user)`. On logout, `clearToken()` (also from `auth.client.ts`) is handled by `logout()`. `useAuth`'s `login`/`register` delegate to `services/auth.client.ts`.

---

## Testing

Vitest with `jsdom`, mirroring each `components/`, `hooks/`, and `utils/` folder (top-level and per-page-module) with a sibling `tests/` folder — one test file per source file. `msw` intercepts the `fetch` calls made by `services/*.client.ts` functions, so components/hooks are tested through the same client calls they use in production, never by mocking a `.client.ts` module directly. `src/tests/utils/renderWithProviders.tsx` wraps `QueryClientProvider`/`MemoryRouter` (and `AuthProvider`/`ThemeProvider` when needed) for component tests. Full architecture and examples: `docs/TESTING.md`.

```bash
npm run test -w apps/web            # run web tests only
npm run test:coverage -w apps/web   # with coverage report
```

---

## How to build and run

```bash
# From repo root:
npm run dev         # builds shared, then runs Vite dev server on port 5173
npm run build       # Vite production build to apps/web/dist/
npm run typecheck   # type-check without emitting
npm run test -w apps/web  # run tests (see "Testing" above)
```

Requires `VITE_API_URL` set (e.g. `http://localhost:4000`). Falls back to `http://localhost:4000` if unset.

---

## What to never do

- Call `fetch` or `apiRequest` directly in components or pages — always go through a `services/<module>.client.ts` function
- Import anything from `services/api.client.ts` outside of `services/` — not just `apiRequest`, but `tokenStore`, `ApiError`, `apiUrl`, and `apiAssetUrl` too. Every one of those is wrapped by a `.client.ts` function (`auth.client.ts`'s `getToken`/`setToken`/`clearToken`, `users.client.ts`'s `getAvatarUrl`, etc.) — `grep -r "services/api" src` outside `services/` itself should return nothing
- Put filtering, sorting, grouping, or aggregate computation in a `.client.ts` file — it only builds requests; that logic belongs in the backend's `read.service.ts`
- Use inline `style` props for layout/theming — use Tailwind classes
- Access `localStorage` or `tokenStore` directly for the token from a page/component/hook — use `getToken`/`setToken`/`clearToken` from `services/auth.client.ts`
- Define new TypeScript types that duplicate a type already in `src/types/<client>.types.ts` or a page's `types/<pageName>.types.ts` — extend or reuse existing types
- Add a type to a catch-all file instead of the owning client's `types/<client>.types.ts` — there is no `api.ts`/`api.types.ts` to fall back to
- Import from `apps/api` — the only shared code is from `@flowledger/shared`
- Use `useEffect` + `fetch` for data fetching — use TanStack Query
- Hard-code API paths as strings in components — use route constants from `constants/routes.ts` for page navigation, and call a `services/<module>.client.ts` function instead of a literal API path string
- Leave a component/hook/util in the top-level `components/`/`hooks/`/`utils/` folder once it's only used by one page module — move it into that page's local folder (see "What belongs globally vs. in a page module")
- Export a function, component, hook, or type without a TSDoc comment, or write one that narrates a change instead of explaining current behavior (see root `CLAUDE.md`)
- Define a type outside `types/`, request-building logic outside a `<module>.client.ts` file — one file role per file (see root `CLAUDE.md`)

---

## Read before touching

| File | Why |
|---|---|
| `src/main.tsx` | Router setup, provider tree, all route-to-page mappings |
| `src/services/api.client.ts` | `apiRequest`, `tokenStore`, `ApiError` — the only fetch layer, wrapped by every other `<module>.client.ts` |
| `src/services/` | The per-module client files — check here first for existing request-building logic before adding new `apiRequest` usage |
| `src/hooks/useAuth.tsx` | Auth context shape and how token/user state is managed |
| `src/layout/AppLayout.tsx` | Sidebar nav, notification bell, mobile layout — shared shell for all auth'd pages |
| `src/types/` | Per-client global API response types (`<client>.types.ts`) — check here before adding a new response shape |
| `src/tests/mocks/server.ts` + `src/tests/setup.ts` | msw server/handlers and Vitest global setup — read before writing a component/hook test |
| `docs/TESTING.md` | Test architecture, coverage thresholds, `renderWithProviders`/msw patterns |
