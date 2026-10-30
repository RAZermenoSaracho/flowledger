## Why

Users can mint personal API keys (`add-personal-api-keys`) but nothing yet accepts them: every existing route is web-JWT only. Scripts, spreadsheets and other tools need a small, stable, key-authenticated HTTP surface over the user's own accounts, categories and transactions, without exposing the internal web API or granting more than the key's scope allows.

## What Changes

- New `apps/api/src/modules/v1/v1.routes.ts`, mounted at `/v1` in `app.ts`. It is an explicit allowlist of 7 routes; anything else under `/v1` returns a JSON 404.
- Every route reuses the EXISTING `validate(sharedSchema)` and EXISTING controllers (they already read the user from `req.user!.id`, which `requireCredential` sets with the same `{ id, email }` shape). No new services, no new controllers.
- `requireCredential` (API keys only) and the shared rate limiter guard the whole router; `requireScope("write")` guards POST and PUT; the audit line is written for each POST/PUT.
- A `/v1`-only page-size policy for `GET /v1/transactions` (default 50, max 100), implemented as a small pure middleware in the v1 module. The web app and the shared service are untouched.
- New `docs/PUBLIC_API.md` (about one page).
- No DELETE, no account/category writes, no groups, debts, reports, imported-transaction review, `/users/me/*`, `/providers/*`, `/auth/*` or webhooks.

| Method | Path | Scope |
|---|---|---|
| GET | `/v1/accounts`, `/v1/categories` | read |
| GET | `/v1/transactions`, `/v1/transactions/summary`, `/v1/transactions/:id` | read |
| POST | `/v1/transactions` | write |
| PUT | `/v1/transactions/:id` | write |

## Capabilities

### New Capabilities
- `public-rest-api`: the key-authenticated `/v1` REST allowlist, its scope enforcement, pagination policy, error shape and audit behaviour.

### Modified Capabilities

None. (`personal-api-keys` is a separate in-flight change and is only consumed here.)

## Non-goals

- Any DELETE, generic CRUD, OpenAPI generation, idempotency keys, webhooks, or new endpoints beyond the 7 above.
- Changing `requireAuth`, the web app, any existing controller/service, or the shared transaction schemas.
- Accepting OAuth tokens (`flo_`) on `/v1`; `/v1` is API keys only (`fl_`).
- Cursor pagination, or new response envelopes: responses are exactly what the existing controllers return.

## Design (summary; detail in design.md)

- `apps/api/src/modules/v1/v1.routes.ts` composes: limiter, `requireCredential`, then per-route `[requireScope, v1 middleware, validate(schema), asyncHandler(controller)]`, then a catch-all `notFound()`.
- Reused: `accountsQueryParamSchema`, `categoriesQueryParamSchema`, `transactionsQueryParamSchema`, `transactionSchema`, `updateTransactionSchema`; controllers `getAccounts`, `getCategories`, `getTransactions`, `getTransactionsSummaryHandler`, `getTransaction`, `postTransaction`, `putTransaction`.
- Ownership is unchanged: services scope by `userId` in Prisma `where`, so another user's id gives 404 via `notFound()`.

## Dependency

Requires `add-personal-api-keys` to be implemented first: `requireCredential`, `requireScope`, `verifyCredential`, the rate-limiter factory, `utils/auditLog.ts`, `PUBLIC_API_URL`, `trust proxy`. This change adds no migration and no env var.

## Acceptance criteria (canonical section 8, change 2)

- Every listed route works with a valid key of sufficient scope.
- Unlisted routes and DELETE return 404.
- Scopes are enforced (read key on POST/PUT gives 403).
- The web app is unchanged (existing web tests and pages pass; no web file edited).

## Test strategy

Supertest + testcontainers permission matrix, placed per docs/TESTING.md as a module-level test `apps/api/src/modules/v1/tests/v1.routes.test.ts` (real Postgres, Docker required): scope (read key, write key, no key, web JWT, revoked/expired key) x route (all 7 + DELETE + unlisted) x owner/other user. Unit test for the pagination clamp and audit middleware in `modules/v1/utils/tests/`. Web unaffected: run `npm run test`, `typecheck`, `lint`.

## Impact

- Code: new `apps/api/src/modules/v1/` (routes, one utils file, tests); one line added in `apps/api/src/app.ts`.
- Docs: `docs/PUBLIC_API.md`; mention in `apps/api/CLAUDE.md` module list if it enumerates modules.
- No DB, no env, no dependency changes, no web changes.
