## Context

See proposal.md. Existing code this builds on (observed):
- `apps/api/src/middleware/auth.ts`: `requireAuth` verifies the web JWT and sets `req.user = { id, email }`. Unchanged.
- `apps/api/src/modules/auth/utils/tokens.ts`: `hashRefreshToken` = sha256 hex of a high-entropy random token. API keys follow the same pattern (fast deterministic hash, lookup by hash).
- `apps/api/src/app.ts`: routers mounted as `app.use("/users", requireAuth, usersRouter)`; no `trust proxy` yet; `errorHandler` last.
- `apps/api/src/config/env.ts` (Zod): has `API_PORT`, `WEB_APP_URL`; `PUBLIC_API_URL` is added here and in `.env.example`.
- `database/prisma/schema.prisma`: `RefreshToken` (cascade to `User`, `@@index([userId])`) is the model shape to mirror.
- `packages/shared/src/schemas/*.ts` + `index.ts` re-exports; `apps/api/src/types/express.d.ts` augments `Request.user`.
- Web: `routes` in `constants/routes.ts`, routes in `main.tsx`, `pages/Profile/ProfilePage.tsx`, `services/*.client.ts` over `api.client.ts`, shared `Card/Button/FormField/RecordCard/PageHeader`.

## Goals / Non-Goals

**Goals:** a revocable, expiring, scope-limited credential that acts as its owner; verification primitives reusable by changes 2-4; a management UI.

**Non-Goals:** mounting anything on `/v1` or `/mcp`; OAuth; new authorization layer; new service layer.

## Decisions

1. **Key format and storage.** `fl_` + `randomBytes(32).toString("base64url")`; store `secretHash = sha256hex(fullKey)` (`@unique`), `hint = key.slice(0,8)`. Lookup by hash, no prefix parsing, no `timingSafeEqual` (the compared value is a hash of a 256-bit secret; there is nothing to time). Alternative bcrypt/argon: rejected, wasted CPU on high-entropy secrets. Utils live in `modules/apiKeys/utils/apiKeys.ts` (`generateApiKey`, `hashApiKey`, `resolveExpiresAt(lifetime, now)`), pure and unit-tested. Hash helper duplicates a one-liner from auth tokens; kept separate to avoid coupling modules.
2. **Lifetime.** `credentialLifetimeSchema = z.enum(["1d","1m","1y","never"])` in `packages/shared/src/schemas/apiKeys.ts`, default `"1m"`. `resolveExpiresAt` uses calendar months/years via `Date#setMonth/setFullYear` (UTC), clamped to month end.
3. **Create schema.** `createApiKeySchema = { name: trimmed 1..60, allowWrite: boolean default false, lifetime: credentialLifetimeSchema.default("1m") }`. `allowWrite` maps to `["read"]` / `["read","write"]`; matches the OAuth consent checkbox later.
4. **Module layering.** `modules/apiKeys/{apiKeys.routes.ts, controllers/{create,read,delete}.controller.ts, services/{create,read,delete}.service.ts, types/apiKeys.types.ts, utils/}`. Mounted in `app.ts` as `app.use("/users/me/api-keys", requireAuth, apiKeysRouter)` before `/users`, so `requireAuth` (JWT only) guards it. Ownership is in Prisma `where` (`updateMany({where:{id,userId,revokedAt:null}})` for revoke; 404 via `notFound()` when count is 0 and the key is not the user's, idempotent when already revoked). Responses go through `serialize()`; list/create responses use an explicit `select` that omits `secretHash`.
5. **`credential.ts`.** `verifyCredential(token)`: if `token.startsWith("fl_")`, `prisma.apiKey.findUnique({where:{secretHash}, include:{user:{select:{id,email}}}})`, reject if missing, revoked, expired; return `VerifiedCredential` per shared contract. Any other prefix throws `HttpError(401)`. A single `if (token.startsWith("fl_"))` branch is the extension point: `add-mcp-oauth` adds a `flo_` branch. No registry/strategy abstraction (one more branch is cheaper than a plugin system). `InvalidTokenError` (SDK class) is not available until change 3 adds the SDK; here an `HttpError(401)` is thrown, and change 3's verifier adapter maps it. `requireCredential` extracts the Bearer token, calls `verifyCredential`, sets `req.user = {id,email}` and `req.credential`. `requireScope(scope)` returns 403 when `req.credential.scopes` lacks it. `express.d.ts` gains `credential?: VerifiedCredential`.
6. **`lastUsedAt`.** Fire-and-forget `prisma.apiKey.updateMany({where:{id, OR:[{lastUsedAt:null},{lastUsedAt:{lt: now-5min}}]}, data:{lastUsedAt: now}}).catch(() => {})` after successful verification; not awaited. Conditional update avoids a read and is race-safe.
7. **Audit helper.** `utils/auditLog.ts` `auditLog({userId, credentialKind, credentialId, op, resourceId, status})` writes `process.stdout.write(JSON.stringify({audit:true, ts, ...}) + "\n")`. Takes a fixed field set, so bodies and secrets cannot be passed. (Uses stdout directly rather than `console`; no env access.)
8. **Rate limiter.** Add `express-rate-limit`; `utils/rateLimit.ts` `createRateLimiter({windowMs, limit})` with `keyGenerator`: sha256 of the Bearer token if present, else `ipKeyGenerator(req.ip)`. Mounting on `/v1` is done by `add-public-rest-api-v1`; on `/mcp` by `add-mcp-server`. Not mounted here.
9. **Config.** `PUBLIC_API_URL: z.string().url().optional()` resolved to `http://localhost:${API_PORT}` default via transform; `.env.example` documents it. `app.set("trust proxy", 1)` (cloudflared is one hop).
10. **Web.** `pages/Developer/DeveloperPage.tsx`, sub-components in `pages/Developer/components/` (`ApiKeysSection`, `CreateApiKeyForm`, `ApiKeyRevealDialog`, `ConnectClientSection`), `services/apiKeys.client.ts`. Native `<dialog>` with `showModal()`; reveal dialog ignores Escape/backdrop (`cancel` event `preventDefault`) until "I've saved it" is clicked; secret held only in component state and cleared on close. Copy uses `navigator.clipboard.writeText` with an `aria-live="polite"` confirmation. Create form: name, Read / Read+Write radios, lifetime radios defaulting to 1 month, text warning on Never. Targets at least 44px. Route `routes.developer = "/profile/developer"` inside the AppLayout protected route; Profile gets a link. "Connect an AI client" text shows `claude mcp add --transport http flowledger <PUBLIC_API_URL>/mcp` and the `--header "Authorization: Bearer fl_..."` variant; the URL comes from a `VITE_`-free source: the web derives it from `VITE_API_URL` (already the API base URL) + `/mcp`, so no new web env var. The text notes the endpoint is available once the MCP server ships.

## Risks / Trade-offs

- Keys are bearer secrets; theft grants access until expiry/revocation → hashed storage, read-only default, default 1-month expiry, instant revoke, `lastUsedAt` visibility.
- `lastUsedAt` write failures are swallowed → acceptable; display-only.
- `Never` lifetime offered to everyone → explicit warning; revocable.
- `requireCredential` unmounted in this change → tested through a test-only Express app, so dead-code risk is limited to one change cycle.
- Date arithmetic for months/years edge cases (Jan 31 + 1m) → clamp to month end, unit-tested.

## Migration Plan

Additive migration creating `ApiKey` (`npm run prisma:migrate`, then `prisma:generate`). Deploy via existing `prisma migrate deploy` (preceded by `pg_dump`). Rollback: revert code; table can remain unused or be dropped by a follow-up migration. The owner sets `PUBLIC_API_URL` in each server `.env` (prod `https://api-flowledger.razs.dev`, dev `https://api-flowledger-dev.razs.dev`); the default keeps local dev working.

## Open Questions

- None blocking. Whether to rename the web "Connect" URL source if a dedicated public URL is ever needed by the SPA can wait until change 3.

## Simplicity audit

Run with the ponytail skill (full level) against the shared contracts and canonical roadmap.

- KEEP: sha256 lookup by hash (no bcrypt, no timingSafeEqual); single `fl_` branch in `verifyCredential` instead of a strategy registry; no new authorization or service layer; `requireAuth` untouched; native `<dialog>`, `navigator.clipboard`, no modal/clipboard libraries.
- KEEP (required by repo rules/contracts): create/read/delete service+controller split and per-file tests; `express-rate-limit` factory (contract, needed by changes 2 and 3); `auditLog` helper (shared contract); test-only router to exercise `requireCredential` since it is unmounted here.
- SIMPLIFY (applied): dropped the dedicated supertest for `trust proxy` (one-line config, typecheck suffices).
- DEFER: key edit/rotate endpoint, AuditEvent table, custom scopes (already in non-goals).
- REMOVE: nothing further. No unnecessary auth abstraction was introduced.
