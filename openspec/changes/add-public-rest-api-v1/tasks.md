## 1. Prerequisites

- [ ] 1.1 Confirm add-personal-api-keys is implemented; read its `middleware/credential.ts`, limiter factory and `utils/auditLog.ts` exports and note the exact names (verify: names recorded in the PR description; `npm run typecheck` resolves the imports).

## 2. v1 module

- [ ] 2.1 Add `apps/api/src/modules/v1/utils/v1Pagination.ts` exporting `clampV1Pagination` middleware with TSDoc (default page 1 / size 50, clamp to 100, 400 on invalid JSON, non-offset kind or pageSize < 1) and `utils/tests/v1Pagination.test.ts` (verify: unit test covers omitted, 500->100, 0, bad JSON, cursor kind, other keys preserved).
- [ ] 2.2 Add `apps/api/src/modules/v1/utils/v1Audit.ts` exporting `auditV1Write(op)` and `utils/tests/v1Audit.test.ts` (verify: test asserts one auditLog call on finish with status, id from params or created body, and no body content in the entry; mocks auditLog).
- [ ] 2.3 Add `apps/api/src/modules/v1/v1.routes.ts` exporting `v1Router` with limiter, `requireCredential`, the 7 routes per design D1 using existing `validate` schemas, controllers and `asyncHandler`, and the final JSON 404 catch-all (verify: `npm run typecheck` and `npm run lint` pass; `/transactions/summary` registered before `/:id`).
- [ ] 2.4 Add `app.use("/v1", v1Router)` to `apps/api/src/app.ts` before `errorHandler`, without `requireAuth` (verify: `git diff` shows only the import and one mount line in app.ts).

## 3. Tests (module-level, Docker required)

- [ ] 3.1 Add `apps/api/src/modules/v1/tests/v1.routes.test.ts` with supertest + testcontainers, following `modules/transactions/tests/transactions.routes.test.ts` and `tests/helpers/*` (verify: suite passes with Docker via the Vagrant setup in CLAUDE.local.md).
- [ ] 3.2 Matrix: credentials {none, web JWT, revoked, expired, read key, write key} x routes {7 listed, DELETE /transactions/:id, GET /reports, POST /accounts} x {own id, other user's id}. Assert 401/403/404/200/201 per the spec, other user's data unchanged after cross-user PUT, lists contain no other-user rows.
- [ ] 3.3 Pagination cases: default 50 with 60 rows, pageSize 500 -> 100, internal `/transactions` with the same query is unaffected.
- [ ] 3.4 Audit and rate-limit cases: one audit line on 201, 403 and 404 writes and none on GET (spy on stdout/auditLog); the limiter is only asserted to be mounted (response carries its headers), since its 429 behaviour is tested in add-personal-api-keys.
- [ ] 3.5 Run `npm run test`, `npm run typecheck`, `npm run lint` across the monorepo (verify: all green; no web file in `git diff --stat`).

## 4. Docs

- [ ] 4.1 Write `docs/PUBLIC_API.md` (about one page): base URL, `Authorization: Bearer fl_...`, scopes, endpoint table, `query` JSON format with a pagination example, error shape, rate limits, explicit "no DELETE" (verify: every curl example runs against a local API with a test key).
- [ ] 4.2 Reference `docs/PUBLIC_API.md` from `apps/api/CLAUDE.md` module list and log any discovered out-of-scope issue in `docs/KNOWN_ISSUES.md` (verify: links resolve).
