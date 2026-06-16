# Architecture

## Overview

FlowLedger is a full-stack personal finance platform organized as an npm workspaces monorepo. The system consists of a REST API backend, a single-page web frontend, a shared contract package, and a centralized Prisma database schema.

---

## Stack

### Backend — `apps/api`

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Express 4 |
| Language | TypeScript |
| ORM | Prisma 6 |
| Database | PostgreSQL |
| Auth | JWT (`jsonwebtoken` + `bcryptjs`) |
| Validation | Zod |
| HTTP security | `helmet`, `cors` |
| Logging | `morgan` |
| File uploads | `multipart` utility (local `uploads/` directory) |

### Frontend — `apps/web`

| Layer | Technology |
|---|---|
| Build | Vite |
| Framework | React 18 |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Data fetching | TanStack Query v5 |
| Routing | React Router v6 |
| Charts | Recharts |

### Shared — `packages/shared`

TypeScript package compiled to ESM. Exports:

- Zod schemas for every domain (auth, accounts, categories, transactions, reports, providers, etc.)
- TypeScript types inferred from schemas
- Constants (transaction types, status enums, etc.)

Both the API and the web app import from `@flowledger/shared`. The shared package must be built before either app can run.

### Database — `database/`

- `prisma/schema.prisma` — single Prisma schema file, PostgreSQL provider
- `seed.ts` — demo data seed script (`npm run prisma:seed`)
- All migrations managed via `prisma migrate dev`

---

## Monorepo scripts (root `package.json`)

| Script | What it does |
|---|---|
| `npm run dev` | Build shared, then run API (`ts-node`/`tsx`) and web (Vite) in parallel |
| `npm run build` | Build shared → API (tsc) → web (Vite) |
| `npm run start` | Build all then run `node apps/api/dist/server.js` + `vite preview` on port 5174 |
| `npm run typecheck` | Type-check all workspaces in sequence |
| `npm run test` | Run all test suites (shared, API, web) |
| `npm run lint` | ESLint across the whole repo |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:migrate` | Run pending migrations (dev mode) |
| `npm run prisma:seed` | Seed demo data |

---

## API server structure (`apps/api/src/`)

```
config/
  env.ts                  # Zod-validated env schema; loads .env from workspace root
db/
  prisma.ts               # Prisma client singleton
middleware/
  auth.ts                 # requireAuth — JWT validation, populates req.user
  errorHandler.ts         # Global Express error handler (HttpError → JSON response)
  validate.ts             # Zod middleware: validate(schema, target?) for body/query/params
modules/
  accounts/               # CRUD for financial accounts
  auth/                   # Registration, login, Google OAuth, /auth/me
  categories/             # CRUD for transaction categories
  debts/                  # Debt listing, settlement requests, direct settlements
  groups/                 # Group CRUD and membership management
  notifications/          # Notification CRUD, mark-read, unread count
  providers/
    provider.types.ts     # FinancialProviderAdapter interface and all provider types
    providerRegistry.ts   # Map of provider key → adapter instance
    providers.routes.ts   # /providers/* routes (connections, accounts, resync)
    providerWebhooks.routes.ts  # /providers/webhooks/:provider (POST = ingest, GET = health)
    index.ts              # Re-exports
    syncfy/
      syncfy.adapter.ts        # FinancialProviderAdapter implementation for Syncfy
      syncfy.routes.ts         # Legacy /syncfy/* routes (deprecated)
      syncfy.service.ts        # All Syncfy API calls, import logic, refresh logic
      syncfy.webhookSecurity.ts # HMAC signature verification
      syncfyAutoSyncScheduler.ts # Background scheduler class and factory
  reports/                # Summary, by-category, monthly-cashflow reports
  shared-expenses/        # Shared expense CRUD and participant management
  transactions/           # Transaction CRUD + imported transaction review workflow
  users/                  # User profile updates, avatar upload
server.ts                 # Express app setup, route mounting, server startup + shutdown
types/
  express.d.ts            # Augments Express Request with req.user and req.rawBody
utils/
  asyncHandler.ts         # Wraps async route handlers; forwards thrown errors to next()
  httpError.ts            # HttpError class + notFound() helper
  multipart.ts            # Multipart form-data parsing (avatar upload)
  serialize.ts            # Converts Prisma Decimal → number, strips passwordHash
```

### Request lifecycle

```
Request
  → helmet (security headers)
  → cors
  → express.json (body parsing + rawBody capture for webhook HMAC)
  → morgan (logging)
  → requireAuth (if protected route) — validates JWT, sets req.user
  → validate(schema) (if route uses it) — Zod validation of body/query/params
  → asyncHandler(routeHandler) — business logic
  → errorHandler (catches HttpError or unexpected errors → JSON)
```

---

## Frontend structure (`apps/web/src/`)

```
constants/
  routes.ts          # Typed route paths (/dashboard, /transactions, etc.)
components/          # Shared UI primitives (Button, Card, FormField, etc.)
hooks/
  useAuth.tsx        # Auth context: user state, setUser, logout
  useTheme.tsx       # Light/dark theme toggle
  useMobileSidebarSide.ts  # Preference for mobile sidebar side
layout/
  AppLayout.tsx      # Top nav, sidebar, notification bell, mobile nav
  ProtectedRoute.tsx # Redirects unauthenticated users to /login
pages/               # One component per route (see docs/FRONTEND_MAP.md)
services/
  api.ts             # apiRequest(), tokenStore (localStorage), ApiError
types/
  api.ts             # Frontend-facing TypeScript types (from API responses)
  syncfy-authentication-widget-umd.d.ts  # Type shim for Syncfy widget UMD build
utils/
  search.ts          # Client-side search utilities
  transactions.ts    # parseTransactionAmount(), summarizeTransactions()
main.tsx             # App entry point; sets up QueryClient, Router, Auth context
polyfills.ts         # Any required browser polyfills
```

---

## Environment variables

All variables are defined and validated in `apps/api/src/config/env.ts`. The API loads `.env` from the workspace root. The web app uses Vite's `import.meta.env` for `VITE_API_URL`.

See `README.md` for the full variable list with descriptions.

---

## Port conventions

| Service | Dev port | Preview/prod port |
|---|---|---|
| API | 4000 | 4000 |
| Web | 5173 | 5174 |

---

## Provider abstraction

The `FinancialProviderAdapter` interface (`provider.types.ts`) defines optional capabilities:

- `listConnectors()` / `listInstitutions()` — discovery
- `createUser()` / `createSession()` / `createConnectionFlow()` — connection setup
- `handleWebhook()` — webhook event processing
- `fetchAccounts()` / `fetchTransactions()` — direct data fetch
- `normalizeAccount()` / `normalizeTransaction()` — payload normalization

Adapters register themselves in `providerRegistry.ts`. Currently only `syncfy` is registered. Adding a new provider means implementing `FinancialProviderAdapter` and calling `providers.set()` in the registry — no other files need to change.
