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

All business logic lives under `src/modules/<domain>/`. Every module follows the same internal layering, split by responsibility rather than bundled into one file per domain:

```
src/modules/<domain>/
  utils/                    module-specific helpers (pure functions, query-shape constants)
  types/                    module-specific types
  services/
    create.service.ts       all create/insert logic
    read.service.ts         all read logic — filtering, sorting, grouping, pagination,
                             ANY data manipulation. This is the only place data is
                             shaped for a response; the frontend never filters/sorts/
                             groups data itself.
    update.service.ts       all update logic
    delete.service.ts       all delete/archive logic
  controllers/               thin: parse/validate input, call a service, shape the
                             HTTP response. No business logic, no direct Prisma calls.
                             One controller file per service file.
  <domain>.routes.ts         imports controllers, wires Express routes. No logic.
```

Routes are mounted in `src/server.ts`. A module only gets the layers it actually needs:
- No create/update/delete logic (e.g. `reports`, which is read-only) → only `read.service.ts` + `read.controller.ts` exist.
- A module whose domain naturally splits into more than one router (e.g. `debts` also owns settlement approval/rejection, `accounts` also owns provider-connection endpoints) exports multiple routers from the same `<domain>.routes.ts` rather than inventing extra route files.
- Split a service file further (e.g. `read.service.ts` → multiple files) if it grows too large for one responsibility to stay readable.

```
src/modules/
  accounts/          accounts.routes.ts (exports accountsRouter, providersRouter,
                       providerWebhooksRouter), services/, controllers/, utils/, types/
    providers/
      syncfy/          see "Providers" below
  auth/              auth.routes.ts, services/, controllers/, utils/
    providers/
      google/          see "Providers" below
  categories/        categories.routes.ts, services/, controllers/, utils/
  currencies/        currencies.routes.ts, services/, utils/
    providers/
      binance/         see "Providers" below
      frankfurter/     see "Providers" below
  debts/             debts.routes.ts (exports debtsRouter, settlementsRouter),
                       services/, controllers/, utils/
  groups/            groups.routes.ts, services/, controllers/, utils/
  notifications/     notifications.routes.ts, services/, controllers/, utils/
  reports/           reports.routes.ts, services/read.service.ts, controllers/, utils/
  shared-expenses/   sharedExpenses.routes.ts, services/, controllers/, utils/, types/
  transactions/      transactions.routes.ts, services/, controllers/, utils/, types/
  users/             users.routes.ts, services/, controllers/, utils/
```

To add a module, create the `<domain>/` directory with whichever layers it needs, add `<domain>.routes.ts`, export a `Router`, then mount it in `server.ts`.

### Providers

A "provider" is an integration with an external API (Syncfy for bank sync, Google for OAuth, Binance/Frankfurter for exchange rates). Providers live **inside the module that owns their domain**, not in a standalone `providers` module:

```
<domain>/providers/<provider-name>/
  <provider-name>.client.ts   raw calls to the external API only — request building,
                               response parsing/validation, and any caching of the
                               external response itself. No business rules.
  utils/                      provider-specific helpers
  types/                      provider-specific types
  services/                   normal create/read/update/delete split on top of the
                               client: business rules, our-own-DB writes, caching of
                               derived data. This is where "raw API response" becomes
                               "shape our backend/frontend expects".
  controllers/                only if the provider needs inbound HTTP routes
  <provider-name>.routes.ts   only if the provider needs inbound HTTP routes
                               (OAuth callback, webhook receiver). Skip both files
                               entirely if the provider is purely outbound (e.g.
                               Binance/Frankfurter, which the app only calls, never
                               receives requests from).
```

Current providers:
- `auth/providers/google/` — Google OAuth login flow. Has `google.routes.ts` (mounted at `/auth/google`) because it needs the OAuth callback route.
- `currencies/providers/binance/`, `currencies/providers/frankfurter/` — exchange rate sources. No routes; nothing calls into these except `currencies/services/read.service.ts`.
- `accounts/providers/syncfy/` — bank sync integration. Has `syncfy.routes.ts` for its (deprecated) health/webhook stub routes, plus `syncfy.adapter.ts` implementing the `FinancialProviderAdapter` contract and `syncfy.webhookSecurity.ts` for HMAC verification.

The **generic** provider abstraction — the `FinancialProviderAdapter` contract, the provider registry, and the provider-agnostic `/providers/*` and `/providers/webhooks/*` HTTP routes (institutions, connectors, connections, provider-account confirm/resync, webhook ingestion) — lives directly on the `accounts` module (`accounts/types/provider.types.ts`, `accounts/utils/providerRegistry.ts`, `accounts/services/providerConnections.*`, `accounts/services/providerWebhooks.service.ts`), since account-provider syncing is what that generic layer exists for. It is provider-agnostic code that happens to currently have one implementation (Syncfy) registered. Never hardcode Syncfy-specific logic outside `accounts/providers/syncfy/` — extend `FinancialProviderAdapter` for new providers instead of branching on provider name in the generic layer (the one pre-existing exception is the webhook HMAC-verification branch, which is provider-specific by necessity since only Syncfy signs its webhooks today).

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
  → asyncHandler(controllerFn)  ← calls the controller
  → errorHandler  ← HttpError → JSON, ZodError → 400, unknown → 500
```

### Typical route → controller → service

```ts
// thing.routes.ts
router.get('/:id', validate(paramsSchema, 'params'), asyncHandler(getThing));

// controllers/read.controller.ts
export async function getThing(req: Request, res: Response) {
  const thing = await getThingById(req.user!.id, req.params.id!);
  res.json({ thing: serialize(thing) });
}

// services/read.service.ts
export async function getThingById(userId: string, id: string) {
  const thing = await prisma.thing.findFirst({ where: { id, userId } }); // ownership in the query
  if (!thing) throw notFound('Thing');
  return thing;
}
```

Key rules:
- Always wrap controller functions in `asyncHandler()` — never use bare `try/catch`
- Enforce ownership in `findFirst({ where: { id, userId } })` — never load then check
- Always call `serialize()` on Prisma responses (converts `Decimal` → `number`)
- Use `notFound()` (from `utils/httpError.ts`) for missing-or-unauthorized resources (consistent 404, no info leak)
- Apply `validate(schema)` before `asyncHandler` when the route has a request body or query params
- Controllers never call Prisma directly and never contain filtering/sorting/business-rule logic — that's the service's job

### Validation

```ts
import { validate } from '../middleware/validate.js';
import { mySchema } from '@flowledger/shared';

router.post('/thing', requireAuth, validate(mySchema), asyncHandler(postThing));
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
- Bypass the Syncfy HMAC webhook signature check (`accounts/providers/syncfy/syncfy.webhookSecurity.ts`)
- Return `passwordHash` or OAuth secrets in any response
- Use `require()` — this is an ESM-only codebase
- Add Syncfy-specific logic outside `src/modules/accounts/providers/syncfy/` — use `FinancialProviderAdapter` for new providers
- Put business logic, filtering, sorting, or grouping in a controller or in the frontend — it belongs in a module's `read.service.ts` (or the relevant service file)
- Use `prisma.$executeRaw` or raw SQL without explicit approval

---

## Read before touching

| File | Why |
|---|---|
| `src/server.ts` | Route mounting order, middleware chain, scheduler startup |
| `src/config/env.ts` | All env vars and their Zod defaults |
| `src/modules/accounts/types/provider.types.ts` | `FinancialProviderAdapter` interface — required reading before any provider work |
| `src/middleware/auth.ts` | `requireAuth` implementation and `req.user` shape |
| `src/utils/asyncHandler.ts` + `src/utils/httpError.ts` | Core error-handling utilities used everywhere |
