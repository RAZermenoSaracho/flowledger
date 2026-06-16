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
├── AGENTS.md         # Agent coding rules and project guidance
├── RULES.md          # Universal engineering and security rules
├── ROADMAP.md        # Product milestones and vision
├── README.md         # Human-facing setup and operations
└── docs/             # Deep-dive documentation
    ├── ARCHITECTURE.md
    ├── DATA_MODEL.md
    ├── API_REFERENCE.md
    ├── FRONTEND_MAP.md
    ├── AUTH_FLOW.md
    ├── PROVIDER_SYNC.md
    ├── DOMAIN_LOGIC.md
    ├── CONVENTIONS.md
    └── TESTING.md
```

---

## How to run

```bash
cp .env.example .env          # fill in secrets before running
npm run dev                   # builds shared, then runs API + web in parallel
npm run build                 # production build of all workspaces
npm run start                 # build + run API node + Vite preview (port 5174)
npm run typecheck             # type-check all workspaces
npm run test                  # run all test suites
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

- **Provider abstraction layer** — All bank integrations go through `FinancialProviderAdapter` (`provider.types.ts`). Never hardcode Syncfy-specific logic outside the `syncfy/` subdirectory.
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
| `apps/api/src/modules/providers/provider.types.ts` | Provider adapter contract |
| `apps/api/src/modules/providers/syncfy/syncfy.service.ts` | Core Syncfy import logic |
| `apps/api/src/modules/providers/syncfy/syncfyAutoSyncScheduler.ts` | Background sync scheduler |
| `packages/shared/src/schemas/` | Shared Zod schemas — always prefer these over ad-hoc validation |

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

---

## Where to find deeper docs

| Doc | Contents |
|---|---|
| `docs/ARCHITECTURE.md` | Stack details, monorepo layout, middleware chain |
| `docs/DATA_MODEL.md` | All Prisma models, relationships, enum values |
| `docs/API_REFERENCE.md` | Every API route, method, auth requirement, purpose |
| `docs/FRONTEND_MAP.md` | Pages, components, hooks, API queries |
| `docs/AUTH_FLOW.md` | JWT, Google OAuth, middleware, token storage |
| `docs/PROVIDER_SYNC.md` | Syncfy integration, webhook security, auto-sync scheduler |
| `docs/DOMAIN_LOGIC.md` | Groups, shared expenses, debts, settlements |
| `docs/CONVENTIONS.md` | Code patterns, error handling, validation, naming |
| `docs/TESTING.md` | Test files, what each covers, how to run |
