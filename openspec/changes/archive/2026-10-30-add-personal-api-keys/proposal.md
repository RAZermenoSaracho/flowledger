## Why

FlowLedger only authenticates with a short-lived web JWT, so scripts, AI clients (Claude Code) and later a public REST API and MCP server have no safe, revocable way to act as a user. Personal API keys are the first building block: a credential that acts as its owner, is read-only by default, expires, and can be revoked instantly. This is change 1 of 4 in the API/MCP roadmap; changes 2 (`add-public-rest-api-v1`), 3 (`add-mcp-server`) and 4 (`add-mcp-oauth`) all depend on it.

## What Changes

- New `ApiKey` Prisma model plus one migration (written as a task; not run while authoring).
- `fl_` key generation, SHA-256 storage, one-time plaintext reveal.
- `/users/me/api-keys` create, list and revoke, reachable only with a web JWT (existing `requireAuth`, unchanged). A key cannot manage keys.
- `apps/api/src/middleware/credential.ts`: `verifyCredential` (`fl_` branch only, structured so `add-mcp-oauth` adds the `flo_` branch), `requireCredential`, `requireScope`.
- Shared schemas in `@flowledger/shared`: `credentialLifetimeSchema` (`1d | 1m | 1y | never`, default `1m`) and `createApiKeySchema`.
- `utils/auditLog.ts` helper emitting the shared audit JSON line (reused by changes 2 and 3).
- Config: `PUBLIC_API_URL` env var, `app.set("trust proxy", 1)`, `express-rate-limit` dependency and a limiter factory.
- Web: `/profile/developer` page with an API keys section (list, create, one-time reveal in a native `<dialog>`, revoke confirm) and a static "Connect an AI client" section; link from Profile.
- `requireAuth` and the web login, refresh and Google flows are unchanged.

## Capabilities

### New Capabilities
- `personal-api-keys`: creation, storage, listing, revocation and verification of personal API keys, the credential middleware, and the Developer page that manages them.

### Modified Capabilities
<!-- None. No specs are archived yet. -->

## Scope

In: everything listed under What Changes. The limiter is only a factory here: mounting it on `/v1` is done by `add-public-rest-api-v1` (and on `/mcp` by `add-mcp-server`). Nothing in this change exposes a route that accepts an API key; `requireCredential` is built and unit/supertest-tested via a test-only router, not mounted in `app.ts`.

## Non-Goals

Deferred items from the canonical roadmap that touch this area:
- No `/v1` routes, no `/mcp`, no OAuth (`flo_`/`flr_` tokens, `OAuthGrant`, Connected apps section) - changes 2-4.
- No `AuditEvent` table or UI; audit is a stdout JSON line only.
- No idempotency keys, no OpenAPI, no DCR.
- No login rate limiting or refresh-token family detection on web sessions (existing gap, log in `docs/KNOWN_ISSUES.md`).
- No per-key custom scopes beyond `read` / `read+write`; no key rotation or edit endpoint (create a new key and revoke the old).
- No account/category writes, no DELETE, no groups/debts/reports exposure.

## Acceptance Criteria

- A key acts as its owner; user A's key cannot read user B's data.
- A revoked or expired key gets 401 on the next request.
- A key cannot manage keys (`/users/me/api-keys` rejects `fl_` bearer with 401).
- A read key cannot pass `requireScope("write")` (403).
- Deleting the user deletes their keys.
- The secret is returned exactly once and never logged.

## Dependencies

Upstream: none. Downstream: change 2 (uses `requireCredential`, `requireScope`, limiter, audit helper), change 3 (`verifyCredential`, limiter, audit helper, `PUBLIC_API_URL`), change 4 (extends `verifyCredential` with `flo_`, adds Connected apps to the Developer page).

## Test Strategy

Per `docs/TESTING.md` placement (sibling `tests/` folder, one test file per source file):
- Unit (vitest, `mockDeep<PrismaClient>()`): key utils (generation, hashing, expiry), apiKeys services, `verifyCredential`/`requireCredential`/`requireScope`, `auditLog`, limiter factory, controllers; shared schemas in `packages/shared/src/schemas/tests/`.
- Module/integration (supertest + `@testcontainers/postgresql`, needs Docker per `CLAUDE.local.md`): full lifecycle create, list, use, revoke, expiry, cross-user isolation, key-cannot-manage-keys, cascade on user delete.
- Web (RTL + user-event + msw, never mock `.client.ts`): Developer page list/create/reveal/revoke, `apiKeys.client.ts`.

## Impact

Code: `database/prisma/schema.prisma` (+ migration), `apps/api/src/{app.ts,config/env.ts,types/express.d.ts,middleware/credential.ts,utils/auditLog.ts,modules/apiKeys/**}`, `.env.example`, `apps/api/package.json` (`express-rate-limit`), `packages/shared/src/schemas/apiKeys.ts` + index export, `apps/web/src/{main.tsx,constants/routes.ts,pages/Developer/**,pages/Profile/ProfilePage.tsx,services/apiKeys.client.ts}`, docs (`DATA_MODEL.md`, `AUTH_FLOW.md`).
