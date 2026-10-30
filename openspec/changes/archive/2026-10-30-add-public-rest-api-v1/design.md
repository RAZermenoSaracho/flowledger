## Context

- `app.ts` mounts each module as `app.use("/x", requireAuth, xRouter)`; the error handler maps ZodError and datasieve errors to 400, `HttpError` to its status, else 500 (`middleware/errorHandler.ts`). There is no catch-all 404; Express's default 404 is HTML.
- Observed: all needed controllers already take identity from `req.user!.id` (`accounts/controllers/read.controller.ts`, `categories/controllers/read.controller.ts`, `transactions/controllers/{read,create,update}.controller.ts`) and services scope by `userId` in Prisma `where` (`getTransactionById` uses `findFirst({ where: { id, userId } })` then `notFound`). `requireCredential` (from add-personal-api-keys) sets `req.user = { id, email }`, so no controller changes are needed.
- Observed: list/summary take a `query` string param validated by `transactionsQueryParamSchema` (`z.string().max(4000).optional()`); the service JSON-parses it (`parseTransactionsQueryParam`) into `{ where, sort, pagination }`. `db/sieve.ts` sets no `defaultPageSize`, and `listTransactions` deliberately forwards omitted pagination unchanged.
- Observed: web calls `listTransactions()` with no pagination in `SharedExpenses/hooks/useSharedExpenseForm.ts` (expects ALL rows) and with `{ kind: "offset", page: 1, pageSize: 5 }` in `DashboardPage.tsx`. Pagination shape: `{ kind: "offset", page, pageSize }`.
- Depends on add-personal-api-keys for `requireCredential`, `requireScope`, the limiter factory and `utils/auditLog.ts`. Exact export names below are as stated in shared-contracts and must be matched to what that change ships.

## Goals / Non-Goals

**Goals:** a 7-route allowlist adapter with zero new business logic; preserve every existing authorization check; bounded page size for external clients.

**Non-Goals:** new services/controllers, DELETE, OpenAPI, changes to the web app or the shared service behaviour, idempotency.

## Decisions

### D1. One router file as the allowlist
`modules/v1/v1.routes.ts` exports `v1Router`, mounted by one line `app.use("/v1", v1Router)` in `app.ts` (no `requireAuth` there). Order inside the router:

1. rate limiter (factory from add-personal-api-keys), first so unauthenticated floods are limited too;
2. `requireCredential`;
3. the 7 routes;
4. `v1Router.use((_req, _res, next) => next(notFound("Route")))` giving JSON 404 for everything else, including DELETE.

Alternative (mount the existing routers under `/v1` and filter) rejected: it would expose everything by default. Explicit listing fails closed.

Route table (each reuses the cited schema and controller):

| Route | Chain |
|---|---|
| GET /accounts | validate(accountsQueryParamSchema,"query"), getAccounts |
| GET /categories | validate(categoriesQueryParamSchema,"query"), getCategories |
| GET /transactions/summary | validate(transactionsQueryParamSchema,"query"), getTransactionsSummaryHandler |
| GET /transactions | validate(transactionsQueryParamSchema,"query"), clampV1Pagination, getTransactions |
| GET /transactions/:id | getTransaction |
| POST /transactions | auditV1Write("transaction.create"), requireScope("write"), validate(transactionSchema), postTransaction |
| PUT /transactions/:id | auditV1Write("transaction.update"), requireScope("write"), validate(updateTransactionSchema), putTransaction |

`/summary` is registered before `/:id`. Controllers are wrapped in `asyncHandler` exactly as in the internal router. Mirror the internal router's chain per route; do not invent differences.

### D2. Page-size cap applies to `/v1` only (not the web app)
The canonical text says "page-size cap in the transactions list service". Rejected: `listTransactions` is shared with the web, and `useSharedExpenseForm` calls it with no pagination expecting every row; a service-level default of 50 would silently truncate that form's data, and the web has no "load more" there. The `db/sieve.ts` header also documents "no silent cap" as deliberate. So the cap is an external-API policy.

Implementation: a small pure Express middleware `clampV1Pagination` in `modules/v1/utils/v1Pagination.ts` that runs after `validate`, parses `req.query.query` (JSON object, else 400 with the same message style as the service), sets `pagination = { kind:"offset", page: page ?? 1, pageSize: clamp(pageSize ?? 50, 1..100) }` and re-serializes into `req.query.query`. Non-object/invalid JSON -> `badRequest`. `kind` other than `"offset"` -> `badRequest`. `pageSize < 1` -> `badRequest`; `> 100` -> clamped to 100 (documented). It is not a controller or service and holds no Prisma. This deviates from the canonical text "in the service" for the reason above; flagged to the owner. Req.query writability: `validate` already assigns to `req.query` in this codebase, so the same pattern works (verify in the test).

Alternative: an optional `maxPageSize` argument on `listTransactions` plus a thin v1 controller. Rejected: touches the service and needs a new controller, both barred by scope.

### D3. Audit via a thin middleware, placed before scope check
`auditV1Write(op)` in `modules/v1/utils/v1Audit.ts`: on `res.on("finish")` calls the shared `auditLog({ userId, credentialKind, credentialId, op, resourceId, status })`. `resourceId` = `req.params.id`, or for POST the `transaction.id` captured by wrapping `res.json` once (the only way to see the created id without editing the controller). It never reads `req.body`. It is registered before `requireScope` so a 403 on a read key is audited too (a denied write attempt is the most interesting audit event). Reads are not audited (contract: writes only).

### D4. No new schemas, no OpenAPI
All schemas exist in `@flowledger/shared`. `docs/PUBLIC_API.md` is hand-written: base URL `${PUBLIC_API_URL}/v1`, `Authorization: Bearer fl_...`, scopes, the 7 endpoints, the `query` JSON format with a pagination example, error shape (`{message, issues?}`), 429 limits, no DELETE.

### D5. Identity
Controllers take identity from `req.user!.id`; nothing in `/v1` reads user ids from body, params or query. Ownership remains in each service's Prisma `where`; cross-user ids -> `notFound()` (404), unchanged.

## Risks / Trade-offs

- [`transactionSchema` may accept `groupId`/shared-expense related fields, widening external write surface] -> Same validation and service checks as the web; document in PUBLIC_API.md; if it proves too wide, add a stricter v1 schema later (deferred).
- [`GET /v1/transactions/:id` returns relations incl. `sharedExpense` participants] -> Same data the owner sees in the web; accepted.
- [Wrapping `res.json` for audit is slightly hacky] -> Isolated in one 15-line util with a unit test; alternative is `resourceId` null on create, which loses the created id.
- [Pagination clamp by JSON re-serialization depends on the `query` format] -> Covered by unit tests; stays aligned because it uses the same `JSON.parse` contract as the service.
- [Export names from add-personal-api-keys may differ] -> Task 1.1 reconciles names before coding.
- [Rate limiter keyed by credential hash needs the token before auth] -> That is the limiter factory's concern; this change only mounts it first.

## Migration Plan

Additive: no DB, env or web changes. Deploy with the API. Rollback = remove the mount line.

## Open Questions

- Does add-personal-api-keys mount the limiter itself or only export the factory? This design assumes the factory is exported and `v1Router` applies it (contract says "mounts it on /v1", but the router file is owned here). Resolve at implementation by reading the shipped code; no spec impact.

## Simplicity audit

Ran with the ponytail skill (full level).

| Item | Verdict | Reason |
|---|---|---|
| Single `v1.routes.ts` allowlist, existing `validate` + controllers, no new service/controller | KEEP | Smallest adapter; fails closed; zero duplicated logic. |
| Identity and ownership | KEEP | Controllers read `req.user!.id`; Prisma `where` ownership untouched; no new authorization layer; cross-user -> 404 unchanged. |
| `clampV1Pagination` middleware (v1 only) | KEEP | Cheapest option that does not touch the shared service or break `useSharedExpenseForm` (needs all rows); about 20 lines. |
| `auditV1Write` with `res.json` wrap | KEEP, narrow | Needed for the created id in the audit line; if it proves brittle, DEFER the id on POST and log `resourceId: null`. |
| JSON 404 catch-all | KEEP | One line; Express default is HTML. |
| Separate v1 request schemas, OpenAPI, idempotency, cursor pagination | REMOVE / DEFER | Not needed; add when external integrators ask. |
| 429 behaviour test in this change | REMOVE | Limiter is tested where it is defined (add-personal-api-keys); only mounting is checked here. |
