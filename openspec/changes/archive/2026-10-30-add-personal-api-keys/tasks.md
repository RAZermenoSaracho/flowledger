# Tasks

## 1. Data model and config

- [x] 1.1 Add `ApiKey` model (fields per shared contract, `onDelete: Cascade` relation, `@@index([userId])`) and `User.apiKeys` relation to `database/prisma/schema.prisma`; run `npm run prisma:migrate` and `npm run prisma:generate`; verify migration file exists and `npm run typecheck` passes
- [x] 1.2 Add `PUBLIC_API_URL` to the Zod schema in `apps/api/src/config/env.ts` (default `http://localhost:${API_PORT}`) and to `.env.example`; verify with an env unit test that the default applies and a custom URL is honoured
- [x] 1.3 Add `app.set("trust proxy", 1)` in `apps/api/src/app.ts`; verify `npm run typecheck` passes and the line is present (one-line config, no dedicated test)
- [x] 1.4 Add `express-rate-limit` to `apps/api/package.json` and implement `apps/api/src/utils/rateLimit.ts` `createRateLimiter` keyed by bearer-token hash or IP (not mounted); verify with `utils/tests/rateLimit.test.ts` (same token shares a bucket, different tokens do not, no-token uses IP)

## 2. Shared schemas

- [x] 2.1 Create `packages/shared/src/schemas/apiKeys.ts` with `credentialLifetimeSchema` (default `1m` where used) and `createApiKeySchema`, export from `schemas` index/`src/index.ts`; verify with `schemas/tests/apiKeys.test.ts` (defaults, rejects bad lifetime/empty name)

## 3. API keys module

- [x] 3.1 Implement `modules/apiKeys/utils/apiKeys.ts` (`generateApiKey`, `hashApiKey`, `resolveExpiresAt`); verify with `utils/tests/apiKeys.test.ts` (`fl_` prefix, hint, hash determinism, 1d/1m/1y/never incl. month-end clamp)
- [x] 3.2 Implement `services/create.service.ts`, `read.service.ts`, `delete.service.ts` (ownership in `where`, no `secretHash` in selects); verify with mockDeep unit tests including cross-user 404 and idempotent revoke
- [x] 3.3 Implement controllers (asyncHandler-wrapped, `serialize()`), `types/apiKeys.types.ts`, `apiKeys.routes.ts` with `validate(createApiKeySchema)`; mount `app.use("/users/me/api-keys", requireAuth, apiKeysRouter)` before `/users`; verify with controller unit tests
- [x] 3.4 Supertest + testcontainers `modules/apiKeys/tests/apiKeys.routes.test.ts`: create/list/revoke lifecycle, secret absent from list, user B cannot see/revoke A's key, an `fl_` bearer on `/users/me/api-keys` gets 401, deleting the user cascades keys (requires Docker per `CLAUDE.local.md`)

## 4. Credential middleware and audit

- [x] 4.1 Add `credential?: VerifiedCredential` to `apps/api/src/types/express.d.ts` and implement `middleware/credential.ts` (`verifyCredential` fl_ branch, `requireCredential`, `requireScope`, throttled non-blocking `lastUsedAt`); verify with `middleware/tests/credential.test.ts` (valid, revoked, expired, unknown, JWT rejected, user missing, 403 on missing write, write implies read, lastUsedAt throttled)
- [x] 4.2 Implement `utils/auditLog.ts`; verify with `utils/tests/auditLog.test.ts` (single JSON line, exact fields, no extras)
- [x] 4.3 Supertest check in the apiKeys routes test using a test-only router with `requireCredential`/`requireScope("write")`: key acts as owner, A cannot read B's data, revoked/expired give 401 on next request, read key gets 403 on write route

## 5. Web Developer page

- [x] 5.1 Create `services/apiKeys.client.ts` (create/list/revoke) and `constants/routes.ts` `developer`; verify with msw-backed `services/tests/apiKeys.client.test.ts`
- [x] 5.2 Build `pages/Developer/` (`DeveloperPage`, `ApiKeysSection`, `CreateApiKeyForm`, `ApiKeyRevealDialog`, revoke confirm dialog, `ConnectClientSection`) using Card/Button/FormField/RecordCard; verify with RTL+msw tests: list renders expiry/last used, default lifetime 1 month, Never warning, reveal shown once and cannot be dismissed until acknowledged, secret gone afterward, copy announces via aria-live, revoke confirm names the key
- [x] 5.3 Register `/profile/developer` in `main.tsx` inside the protected layout and add a link from `ProfilePage.tsx`; update `ProfilePage.test.tsx`; verify the link navigates

## 6. Docs and verification

- [x] 6.1 Update `docs/DATA_MODEL.md` and `docs/AUTH_FLOW.md` (API key credential, `PUBLIC_API_URL`) and log the web login-rate-limit gap in `docs/KNOWN_ISSUES.md` if not present
- [x] 6.2 Run `npm run typecheck`, `npm run lint`, `npm run test` (and the Docker integration suite) and verify all pass; manually confirm the plaintext key never appears in server logs
  - Closed 2026-10-30 after `fix-repository-lint-errors`: repo-wide `npm run lint` exits 0 (0 errors, 0 warnings), typecheck passes, tests pass (shared 192, web 918, api 1348 incl. Docker integration).
  - Note (2026-10-30): typecheck pass; changed-file lint clean; tests pass (shared 162 / api 1007 incl. Docker / web 858); live log check on throwaway API (port 4099): plaintext key and secret part absent from server log (0 matches). Left unchecked: repo-wide lint has 81 pre-existing errors (docs/KNOWN_ISSUES.md #008).
