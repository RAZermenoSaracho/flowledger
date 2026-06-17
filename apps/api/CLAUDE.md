# apps/api — Claude Code Guide

Express + TypeScript REST API. Runs on port 4000. Serves all FlowLedger data to the web app and processes provider webhooks.

See the root `CLAUDE.md` for monorepo-level constraints, secrets policy, and branch rules.

---

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js (ESM, `"type": "module"`) |
| Framework | Express 4 |
| Language | TypeScript |
| ORM | Prisma 6 (PostgreSQL) |
| Auth | JWT (`jsonwebtoken` + `bcryptjs`) |
| Validation | Zod (schemas from `@flowledger/shared`) |
| HTTP security | `helmet`, `cors` |
| Logging | `morgan` |

---

## Module system

All business logic lives under `src/modules/<domain>/`. Every module has exactly one `<domain>.routes.ts` that exports a configured `Router`. Modules with non-trivial logic also have a `<domain>.service.ts`.

```
src/modules/
  accounts/          accounts.routes.ts
  auth/              auth.routes.ts
  categories/        categories.routes.ts
  debts/             debts.routes.ts, debtDirection.ts
  groups/            groups.routes.ts, groups.service.ts
  notifications/     notifications.routes.ts, notifications.service.ts
  providers/         providers.routes.ts, providerWebhooks.routes.ts, provider.types.ts, providerRegistry.ts
    syncfy/          syncfy.adapter.ts, syncfy.service.ts, syncfy.routes.ts (deprecated),
                     syncfy.webhookSecurity.ts, syncfyAutoSyncScheduler.ts
  reports/           reports.routes.ts
  shared-expenses/   sharedExpenses.routes.ts, sharedExpenses.service.ts
  transactions/      transactions.routes.ts, transactionCalculations.ts
  users/             users.routes.ts
```

Routes are mounted in `src/server.ts`. To add a module, create the `<domain>/` directory, add `<domain>.routes.ts`, export a `Router`, then mount it in `server.ts`.

---

## Request lifecycle

```
Request
  → helmet (security headers)
  → cors
  → express.json (body parse + rawBody capture for HMAC)
  → morgan (logging)
  → requireAuth  ← JWT validation, sets req.user (skipped for /auth and /providers/webhooks)
  → validate(schema, target?)  ← Zod validation of body/query/params (optional per route)
  → asyncHandler(routeHandler)  ← business logic
  → errorHandler  ← HttpError → JSON, ZodError → 400, unknown → 500
```

### Typical route handler

```ts
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const record = await prisma.thing.findFirst({
    where: { id: req.params.id, userId: req.user.id }, // ownership enforced in query
  });
  if (!record) throw notFound();
  res.json(serialize(record));
}));
```

Key rules:
- Always wrap async handlers in `asyncHandler()` — never use bare `try/catch`
- Enforce ownership in `findFirst({ where: { id, userId } })` — never load then check
- Always call `serialize()` on Prisma responses (converts `Decimal` → `number`)
- Use `notFound()` (from `utils/httpError.ts`) for missing-or-unauthorized resources (consistent 404, no info leak)
- Apply `validate(schema)` before the `asyncHandler` when the route has a request body or query params

### Validation

```ts
import { validate } from '../middleware/validate.js';
import { mySchema } from '@flowledger/shared';

router.post('/thing', requireAuth, validate(mySchema), asyncHandler(async (req, res) => {
  // req.body is typed and validated
}));
```

`validate(schema, target?)` — `target` is `"body"` (default), `"query"`, or `"params"`.

---

## Environment variables

All env vars are parsed and validated at startup by `src/config/env.ts` (Zod schema). Never read `process.env.*` directly — import from `config/env.ts`:

```ts
import { env } from '../config/env.js';
```

Adding a new env var: add it to the Zod schema in `env.ts` and document it in `.env.example`. If you only add it to `.env.example`, startup will fail.

---

## ESM import rule

All relative imports require `.js` extensions (Node ESM requirement):

```ts
import { asyncHandler } from './utils/asyncHandler.js'; // .js even though source is .ts
```

---

## How to build and run

```bash
# From repo root:
npm run dev            # builds shared, then runs API with tsx (hot reload)
npm run build          # tsc compile to dist/
npm run typecheck      # type-check without emitting
npm run test -w apps/api  # run API tests only
```

API listens on `env.API_PORT` (default `4000`). Requires a running PostgreSQL instance and all vars in `.env`.

---

## What to never do

- Skip `asyncHandler` — unhandled promise rejections bypass the error handler
- Read `process.env.*` directly — always use `env` from `config/env.ts`
- Check ownership in JavaScript after loading a record — enforce it in the Prisma `where` clause
- Call `res.json()` on Prisma data without `serialize()` — `Decimal` values won't serialize correctly
- Write inline Zod schemas in route files — put them in `packages/shared/src/schemas/`
- Bypass the Syncfy HMAC webhook signature check
- Return `passwordHash` or OAuth secrets in any response
- Use `require()` — this is an ESM-only codebase
- Add Syncfy-specific logic outside `src/modules/providers/syncfy/` — use `FinancialProviderAdapter` for new providers
- Use `prisma.$executeRaw` or raw SQL without explicit approval

---

## Read before touching

| File | Why |
|---|---|
| `src/server.ts` | Route mounting order, middleware chain, scheduler startup |
| `src/config/env.ts` | All env vars and their Zod defaults |
| `src/modules/providers/provider.types.ts` | `FinancialProviderAdapter` interface — required reading before any provider work |
| `src/middleware/auth.ts` | `requireAuth` implementation and `req.user` shape |
| `src/utils/asyncHandler.ts` + `src/utils/httpError.ts` | Core error-handling utilities used everywhere |
