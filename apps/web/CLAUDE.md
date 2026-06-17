# apps/web — Claude Code Guide

React + Vite SPA. Runs on port 5173 (dev) / 5174 (preview). The user-facing frontend for FlowLedger.

See the root `CLAUDE.md` for monorepo-level constraints, secrets policy, and branch rules.

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
| Auth | JWT in `localStorage` via `tokenStore` |

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
| `/accounts` | `AccountsPage` | Yes |
| `/categories` | `CategoriesPage` | Yes |
| `/groups` | `GroupsPage` | Yes |
| `/debts` | `DebtsPage` | Yes |
| `/reports` | `ReportsPage` | Yes |
| `/profile` | `ProfilePage` | Yes |

`ProtectedRoute` checks `tokenStore.get()` and redirects to `/login?redirect=<path>` if no token is present.

---

## API calls — `services/api.ts`

All server communication goes through `src/services/api.ts`. Never use `fetch` directly in page or component code.

```ts
import { apiRequest, tokenStore, ApiError, apiUrl, apiAssetUrl } from '../services/api';

// GET
const data = await apiRequest<MyType>('/resource');

// POST with body
const result = await apiRequest<MyType>('/resource', { method: 'POST', body: payload });

// GET with query params
const list = await apiRequest<MyType[]>('/resource', { query: { status: 'active' } });
```

- `apiRequest<T>` auto-adds `Authorization: Bearer <token>` and throws `ApiError` on non-2xx
- `tokenStore` — get/set/clear JWT in `localStorage` under key `"flowledger.token"`
- `apiUrl(path)` — absolute API URL for constructing links
- `apiAssetUrl(path)` — absolute URL for API-served assets (avatars, uploads)

---

## Data fetching pattern

All server state uses TanStack Query. Standard patterns:

```ts
// Query
const { data } = useQuery({
  queryKey: ['resource', id],
  queryFn: () => apiRequest<Resource>(`/resource/${id}`),
});

// Mutation with cache invalidation
const mutation = useMutation({
  mutationFn: (body: Payload) => apiRequest('/resource', { method: 'POST', body }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resource'] }),
});
```

---

## Component and hook conventions

- Pages: `src/pages/<Name>Page.tsx`, exported as named export (`PascalCase`)
- Shared UI primitives: `src/components/<Name>.tsx`
- Custom hooks: `src/hooks/use<Name>.tsx` or `.ts`
- Layout wrappers: `src/layout/<Name>.tsx`
- Styling: Tailwind utility classes only — no inline `style` props, no CSS modules
- No component-level `fetch` calls — always use `apiRequest` via TanStack Query

### Adding a new page

1. Create `src/pages/<Name>Page.tsx` with a named export
2. Add a route constant to `src/constants/routes.ts`
3. Add the `<Route>` in `src/main.tsx` (inside the `<ProtectedRoute>` wrapper if auth-required)
4. If auth-required: it will render inside `AppLayout` automatically

### Adding a new component

Create `src/components/<Name>.tsx`. Export named. Use existing primitives (`Button`, `Card`, `FormField`) before creating new ones.

---

## Auth context

`useAuth` (from `src/hooks/useAuth.tsx`) provides `{ user, setUser, logout }`. On login, store the JWT with `tokenStore.set(token)` and call `setUser(user)`. On logout, `tokenStore.clear()` is handled by `logout()`.

---

## How to build and run

```bash
# From repo root:
npm run dev         # builds shared, then runs Vite dev server on port 5173
npm run build       # Vite production build to apps/web/dist/
npm run typecheck   # type-check without emitting
```

Requires `VITE_API_URL` set (e.g. `http://localhost:4000`). Falls back to `http://localhost:4000` if unset.

---

## What to never do

- Call `fetch` directly in components or pages — always use `apiRequest` from `services/api.ts`
- Use inline `style` props for layout/theming — use Tailwind classes
- Access `localStorage` directly for the token — use `tokenStore`
- Define new TypeScript types that duplicate `src/types/api.ts` — extend or reuse existing types
- Import from `apps/api` — the only shared code is from `@flowledger/shared`
- Use `useEffect` + `fetch` for data fetching — use TanStack Query
- Hard-code API paths as strings in components — use route constants from `constants/routes.ts` for page navigation, and use `apiRequest(path)` with literal API path strings

---

## Read before touching

| File | Why |
|---|---|
| `src/main.tsx` | Router setup, provider tree, all route-to-page mappings |
| `src/services/api.ts` | `apiRequest`, `tokenStore`, `ApiError` — the only fetch layer |
| `src/hooks/useAuth.tsx` | Auth context shape and how token/user state is managed |
| `src/layout/AppLayout.tsx` | Sidebar nav, notification bell, mobile layout — shared shell for all auth'd pages |
| `src/types/api.ts` | Frontend TypeScript types for all API response shapes |
