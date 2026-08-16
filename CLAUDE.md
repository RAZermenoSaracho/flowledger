# FlowLedger — Claude Code Guide

FlowLedger is a web-first personal finance platform built as an npm workspaces monorepo. It lets users aggregate bank accounts via provider integrations (currently Syncfy), manage personal and shared transactions, track debts and group settlements, and view financial reports. The long-term goal is a provider-agnostic financial operating system for individuals and small groups.

---

## Monorepo layout

```
flowledger/
├── apps/
│   ├── api/          # Express + TypeScript REST API (port 4000)
│   └── web/          # React + Vite SPA (port 5173 dev / 5174 preview)
├── packages/
│   └── shared/       # Shared Zod schemas, TypeScript types, constants
├── database/
│   └── prisma/
│       └── schema.prisma   # Single source of truth for the data model
├── CLAUDE.md         # This file (read first every session)
├── ROADMAP.md        # Product milestones and vision
├── README.md         # Human-facing setup and operations
└── docs/             # Deep-dive documentation
    ├── DATA_MODEL.md
    ├── AUTH_FLOW.md
    ├── PROVIDER_SYNC.md
    ├── DOMAIN_LOGIC.md
    └── TESTING.md
```

---

## How to run

Node `>=24` required (see `.nvmrc` / `engines` in root `package.json`).

```bash
cp .env.example .env          # fill in secrets before running
npm run dev                   # builds shared, then runs API + web in parallel
npm run build                 # production build of all workspaces
npm run start                 # build + run API node + Vite preview (port 5174)
npm run typecheck             # type-check all workspaces
npm run test                  # run all test suites
npm run test:coverage         # run all test suites with coverage reports
npm run lint                  # ESLint across monorepo
npm run prisma:generate       # regenerate Prisma client after schema changes
npm run prisma:migrate        # run pending migrations (dev)
npm run prisma:seed           # seed demo data
```

Required env vars (see `.env.example` and `apps/api/src/config/env.ts` for full list):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | ≥16-char secret for signing tokens |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `API_PORT` | API listen port (default `4000`) |
| `WEB_APP_URL` | Frontend origin (e.g. `http://localhost:5173`) |
| `VITE_API_URL` | API base URL consumed by the web app |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Google OAuth |
| `SYNCFY_API_KEY` | Syncfy API key (optional; disables Syncfy if absent) |
| `SYNCFY_WEBHOOK_SIGNATURE_KEY` | HMAC key for webhook signature verification |
| `SYNCFY_AUTO_SYNC_ENABLED` | Enable background auto-sync scheduler |
| `SYNCFY_AUTO_SYNC_INTERVAL_MINUTES` | Scheduler interval (default `60`) |

---

## Key architectural decisions

- **Provider abstraction layer** — All bank integrations go through `FinancialProviderAdapter` (`apps/api/src/modules/accounts/types/provider.types.ts`). Never hardcode Syncfy-specific logic outside `apps/api/src/modules/accounts/providers/syncfy/`. Providers live inside the module that owns their domain (e.g. Google OAuth under `auth/providers/google/`, Binance/Frankfurter under `currencies/providers/`) — see `apps/api/CLAUDE.md` for the full pattern.
- **Imported transaction staging** — Provider transactions land in `ProviderImportedTransaction` (status `pending`) and only become user `Transaction` records after explicit review. This prevents accidental imports and preserves provider metadata.
- **JWT auth only** — All authenticated routes require `Authorization: Bearer <token>`. The `requireAuth` middleware populates `req.user`. No session cookies.
- **Shared Zod schemas** — All request validation uses schemas from `@flowledger/shared`. Backend and frontend share the same contracts.
- **User ownership enforcement** — Every data query scopes by `userId`. There are no admin bypass patterns.
- **Webhook signature enforcement** — Syncfy webhook events are HMAC-verified before processing. Never remove this check.
- **No bank credentials stored** — FlowLedger stores only non-secret Syncfy metadata (`id_credential`, sanitized endpoint paths). Bank usernames, passwords, OTPs, and card numbers are never stored.

---

## Critical files to read before making changes

| File | Why |
|---|---|
| `database/prisma/schema.prisma` | Data model — all relationships, enums, indices |
| `apps/api/src/server.ts` | Route mounting, middleware order, scheduler startup |
| `apps/api/src/config/env.ts` | All environment variables and their defaults |
| `apps/api/src/modules/accounts/types/provider.types.ts` | Provider adapter contract |
| `apps/api/src/modules/accounts/providers/syncfy/services/create.service.ts` | Core Syncfy import logic |
| `apps/api/src/modules/accounts/providers/syncfy/syncfyAutoSyncScheduler.ts` | Background sync scheduler |
| `packages/shared/src/schemas/` | Shared Zod schemas — always prefer these over ad-hoc validation |

---

## Testing

Vitest runs in every workspace (`apps/api`, `apps/web`, `packages/shared`) with an identical config shape. Tests live in a `tests/` folder next to the code they cover — one test file per source file, same base name (`services/create.service.ts` → `services/tests/create.service.test.ts`). Module-level and cross-module tests have their own placement rules. Coverage thresholds are highest on `utils/` (pure business logic), moderate on `services/`/`hooks/`, and unenforced on thin wiring (`controllers/`, routes files). Full architecture, stack, and how-to-write-a-test examples: **`docs/TESTING.md`** — read it before adding or modifying any test.

**Known gap:** there is no CI workflow that runs lint/typecheck/test on pull requests — `.github/workflows/deploy-prod.yml` only deploys on push to `main`. Don't assume a PR has been machine-checked; run `npm run typecheck`, `npm run lint`, and `npm run test` yourself before considering a change done.

---

## Constraints for agents

- Work on branch `razs_ai`, not `main`.
- Never modify `.env` files or commit secrets. Document new variables only.
- Never expose `passwordHash`, OAuth secrets, provider API keys, or webhook signature keys in responses or logs.
- Never remove or weaken Syncfy webhook HMAC validation.
- Never store bank login credentials (usernames, passwords, OTPs, card numbers).
- Database changes must use Prisma migrations — no raw SQL without approval.
- Production Syncfy webhooks route through `/providers/webhooks/syncfy`. The legacy `/syncfy/webhook` route is deprecated and must not be revived for event processing.
- Extend `FinancialProviderAdapter` for new providers — do not create parallel provider-specific systems.
- Use "Group" terminology throughout — never introduce "Household".
- All API input must be validated with shared Zod schemas.
- Every new/changed `controllers/`, `services/`, `utils/`, `hooks/`, or `components/` file gets a matching test file under that folder's `tests/` — see `docs/TESTING.md`.
- See "Comment standard" and "File-role structure" below — both are required reading before writing or editing any code in this repo.

---

## Comment standard

Every exported function, class, type, interface, component, and hook gets a `/** ... */` TSDoc block immediately above it, explaining:
- what it does (one sentence, if not already obvious from the name)
- parameters and return value, when their meaning isn't obvious from names/types alone
- any non-obvious behavior, edge case, or invariant a caller needs to know

An inline `//` comment is acceptable only when it explains a genuinely non-obvious **why** — a hidden constraint, a workaround for a specific limitation, a subtle invariant — that cannot be inferred from reading the code and its names. Prefer fixing the naming/structure so the comment becomes unnecessary over adding one. Private/unexported helpers don't need TSDoc, but a `//` on one still has to clear this same "non-obvious why" bar.

**Never write:**
- A comment narrating a fix, a session, or a past state of the code (`// fixed this bug`, `// this now correctly handles...`, `// regression test for #123`, `// removed the old approach`). That belongs in a commit message or PR description — it rots the moment the code changes again.
- A comment that just restates the next line (`// increment count` above `count++`).
- A `no-op: ...` explanation on an empty callback. If a caller has nothing to do because other code already handles it, document that once, at the definition of the thing that handles it — not at every call site relying on it.
- A comment re-explaining something already documented at a higher level (e.g. re-stating a mutation's invalidation behavior at every call site instead of once on the mutation).

**Before / after:**

```ts
// Before
onCreated={async () => {
  // no-op: mutation inside the form already invalidates queries
}}

// After — documented once, at the mutation that owns the behavior:
/** Called after `saveTransaction` already invalidates transactions/accounts/etc. — only needed for behavior beyond that; a no-op is valid. */
onCreated: () => Promise<void>;
...
onCreated={async () => {}}
```

```ts
// Before
// This function now correctly handles the case where accountId is null
function resolveAccount(accountId: string | null) { ... }

// After
/** Resolves an account by id, or `null` for an unlinked/manual record. */
function resolveAccount(accountId: string | null) { ... }
```

## File-role structure

A file's role is fixed by its location: types only in a module's `types.ts` file (or `types/` folder), services only in `services/` files, API clients only in `<module>.client.ts` files, controllers only in `controllers/` files, tests only in a `tests/` folder. Never define a type, a service function, a client call, a controller handler, or a test inline in a file of a different role — relocate it, even if it's small. See `apps/api/CLAUDE.md` and `apps/web/CLAUDE.md` for the exact per-app layering these roles map to, including the full accepted folder structure for each app; see `docs/TESTING.md` for the testing-specific placement rules.

---

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files | `camelCase.ts` | `transactions.routes.ts` |
| Routes file | `<module>.routes.ts` | `accounts.routes.ts` |
| Service file | `<role>.service.ts` under a module's `services/` folder | `read.service.ts` |
| Test file | `<subject>.test.ts`, in that subject's `tests/` folder | `services/tests/create.service.test.ts` |
| Prisma models | `PascalCase` | `TransactionRelation` |
| DB columns | `camelCase` (Prisma convention) | `createdAt`, `providerCredentialId` |
| Env vars | `SCREAMING_SNAKE_CASE` | `SYNCFY_AUTO_SYNC_ENABLED` |
| API routes | `kebab-case` | `/shared-expenses`, `/monthly-cashflow` |
| React components | `PascalCase.tsx` | `AppLayout.tsx` |
| Custom hooks | `useCamelCase.ts` | `useAuth.ts` |
| Vite env vars | `VITE_*` prefix | `VITE_API_URL` |

---

## Where to find deeper docs

| Doc | Contents |
|---|---|
| `docs/DATA_MODEL.md` | All Prisma models, relationships, enum values |
| `docs/AUTH_FLOW.md` | JWT, Google OAuth, middleware, token storage |
| `docs/PROVIDER_SYNC.md` | Syncfy integration, webhook security, auto-sync scheduler |
| `docs/DOMAIN_LOGIC.md` | Groups, shared expenses, debts, settlements |
| `docs/TESTING.md` | Test architecture, stack, coverage thresholds, how to write and run tests |
| `docs/KNOWN_ISSUES.md` | Backlog of deferred/out-of-scope issues surfaced during work — check before re-flagging something already logged |
| `apps/api/CLAUDE.md` | Backend module system, request lifecycle, provider pattern |
| `apps/web/CLAUDE.md` | Frontend routing, page-module structure, shared components |
| `database/CLAUDE.md` | Schema conventions, migration workflow |
| `packages/shared/CLAUDE.md` | Schema/type/constant package structure |
