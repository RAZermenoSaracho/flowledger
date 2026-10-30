## Context

- `/mcp` (from `add-mcp-server`) uses SDK `requireBearerAuth({ verifier })` wrapping `verifyCredential` (from `add-personal-api-keys`, `middleware/credential.ts`). The MCP adapter reads only `req.auth`, so OAuth tokens arrive purely by extending `verifyCredential`.
- Web session = in-memory access JWT + httpOnly refresh cookie, silently restored at boot (`useAuth.isInitializing`). `requireAuth` validates a Bearer JWT. Google login already carries a `redirect` and `OAuthCallbackPage` already guards it as a relative path. `ProtectedRoute` and `LoginPage` currently drop the target path.
- SDK spike (`sdk-spike-findings.md`): SDK v1 `mcpAuthRouter` runs inside Express 4; SDK verifies PKCE itself via `challengeForAuthorizationCode`; `resource` is optional in the SDK (we enforce); no `iss` support and fixed metadata (we override); SDK ships `express-rate-limit` and `cors()` (`*`) on its handlers; it requires an HTTPS issuer.
- Odoo's `odoo_mcp_oauth` is the behavioural reference: CIMD-only, signed 10-minute consent state bound to the user, single-use 60 s code with replay revoke, duration picker 1d/1m/1y/never, no remembered consent. We add what it lacks: short access tokens, rotating refresh, a grant record, revocation, a Connected apps view.
- Hosts: API `api-flowledger[-dev].razs.dev` (Cloudflare Tunnel -> Express), SPA `flowledger[-dev].razs.dev` (vite preview behind a Node gateway on prod). The SPA host returns HTML for any unknown path, so all discovery metadata lives on the API host.
- Depends on: `add-personal-api-keys` (credential.ts, `credentialLifetimeSchema` + expiry resolver, `PUBLIC_API_URL`, `trust proxy`, limiter factory, audit helper, Developer page) and `add-mcp-server` (`/mcp`, SDK dependency, Zod 3.25). Neither is archived, so everything here is expressed in the new `mcp-oauth` capability.

## Goals / Non-Goals

**Goals:** a standards-compliant, minimal OAuth 2.1 AS that ChatGPT and Claude Code can complete; consent and lifetime controlled by the user; revocation that bites on the next request; secure CIMD fetching.

**Non-Goals:** DCR; `OAuthClient`/`OAuthToken` tables; remembered consent (every connection asks again and creates its own grant); OIDC, id tokens, userinfo; client secrets / confidential clients; per-request-scope narrowing UI beyond read/write; an audit table; admin client allow-list.

## Decisions

### D1. Library shape: SDK `mcpAuthRouter` at the app root, custom metadata first
Mount `mcpAuthRouter({ provider, issuerUrl: PUBLIC_API_URL, resourceServerUrl: ${PUBLIC_API_URL}/mcp, scopesSupported })` at `/`, after a handler we own for `/.well-known/oauth-authorization-server` (built from `createOAuthMetadata` spread with the overrides listed in the spec) and the two protected-resource paths (`mcpAuthMetadataRouter` or two small routes). Endpoints are the SDK's `/authorize`, `/token`, `/revoke` on the API host (no `/oauth` prefix; advertised in metadata, so clients don't care). `/register` is absent because the store has no `registerClient`. Our own routes live under `/oauth/authorize/context|decision` (web-JWT, mounted behind `requireAuth`, with the app's normal CORS = `WEB_APP_URL`). The SDK's built-in limiter stays on; `trust proxy` (earlier change) makes it key on the real IP.
*Alternative:* mount the router at `/oauth` with metadata endpoint overrides. Rejected as extra mapping with no benefit.
*Known limit:* SDK-generated error redirects (invalid_request etc.) carry no `iss`. Only success/deny responses, which we build, include it; error responses are terminal for the client either way.

### D2. `OAuthGrant` is the whole persistence layer
One row per approved connection holding code, current token pair and previous refresh hash (fields per shared contracts). All lookups are by unique hash. Plus one **additive field requested from Opus: `rotatedAt DateTime?`** (needed for the grace rule in D6; see Open Questions). The grant row is created at approval time with the code; a row whose code was never exchanged is an "unfinished grant" and is not listed to the user (stale unfinished rows are tolerated; cleanup is deferred, see Simplicity audit).
Retained after revocation (`revokedAt`) so replays stay detectable; cascades on user delete.

### D3. Consent request and decision integrity
`provider.authorize(client, params, res)`:
1. Require `params.resource?.href === ${PUBLIC_API_URL}/mcp`, else throw `InvalidTargetError` (SDK maps to a redirect with `error`).
2. Sign `req` = `jwt.sign({ cid, ru, cc, st, sc, rs }, JWT_SECRET, { audience: "oauth-consent", expiresIn: "10m" })`, same pattern as `signGoogleState`, in `oauth/utils/consentRequest.ts`.
3. `res.redirect(${WEB_APP_URL}/oauth/authorize?req=...)`.

`decision` service: verify `req` (audience + expiry, shape-checked with a shared Zod schema) -> re-run `getClient(cid)` and confirm `ru` still matches the document (D8 rule) -> build the grant for `req.user.id` (from `requireAuth`, never from the body) -> `scopes = ["read"] + ["write" if sc includes write AND allowWrite]`, lifetime from the shared enum -> create a code (32 random bytes base64url, only its hash stored), `codeExpiresAt = now+60s` -> return redirect URL with `iss = PUBLIC_API_URL`.
*Binding:* the request is issued before the user is known (anonymous authorize), so it is bound to the session at decision time: whoever holds a valid web JWT and sees the consent page decides, and the grant belongs to that JWT's user. The user-switch attack Odoo guards against (login as someone else mid-flow) is covered by "Signed in as" + "Not you?" and by the grant being created for the deciding session only. Tampering is impossible because client, redirect, challenge, state, scopes and resource come only from the signed `req`.
*CSRF:* `context`/`decision` need an `Authorization: Bearer` header from JS; no cookie authenticates them, so a cross-site form post cannot act, and a cross-origin fetch triggers a CORS preflight that only `WEB_APP_URL` passes. *Clickjacking:* see D9. A phished link that sends a victim to a legitimate consent page still shows the real client name and redirect host and requires an explicit click; that is the standard OAuth residual risk, mitigated by the host display.
Replay of `req` within 10 minutes only creates another grant for the same registered redirect after another explicit approval; acceptable, no jti store.

### D4. Codes and token endpoint (Prisma provider)
- `challengeForAuthorizationCode`: find grant by `sha256(code)`; none -> `InvalidGrantError`. If `codeUsedAt` set -> revoke grant (replay), `InvalidGrantError`. If expired or revoked or `clientId` mismatch -> `InvalidGrantError`. Return `codeChallenge`. (The SDK compares PKCE S256.)
- `exchangeAuthorizationCode(client, code, _v, redirectUri, resource)`: require `resource === /mcp` (else `InvalidTargetError`) and `redirectUri === grant.redirectUri`. Then atomic claim: `updateMany({ where: { codeHash, codeUsedAt: null, codeExpiresAt: { gt: now }, revokedAt: null, clientId }, data: { codeUsedAt: now, accessTokenHash, accessExpiresAt, refreshTokenHash, rotatedAt: null } })`. `count === 0` -> re-read: if `codeUsedAt` is set it lost a race or is a replay -> revoke grant; throw `InvalidGrantError`.
- Token response: `access_token flo_...`, `refresh_token flr_...`, `token_type Bearer`, `expires_in = floor((accessExpiresAt-now)/1000)`, `scope = grants.scopes.join(" ")`.
- Tokens: `randomBytes(32).toString("base64url")` with prefix; `sha256hex` of the full string (reuse the helper from the API-keys change).

### D5. Lifetimes
`grant.expiresAt` from the shared lifetime resolver (`null` = Never). `accessExpiresAt = min(now+1h, grant.expiresAt)`. Refresh never touches `grant.expiresAt`. Refresh rejects (`invalid_grant`) once `grant.expiresAt <= now`. Never grants keep rotating hourly.

### D6. Refresh rotation, concurrency and retry policy
Rule (chosen): **rotate atomically; a re-presented previous refresh token within 30 s of its rotation is a legitimate retry and gets a freshly issued pair (not the same pair); beyond 30 s it is theft/reuse and revokes the grant.**

Algorithm (all steps `updateMany`, no transaction needed):
1. *Rotate:* `where { refreshTokenHash: h, revokedAt: null, OR[{expiresAt:null},{expiresAt:{gt:now}}] }` set `prevRefreshTokenHash = h, refreshTokenHash = new, accessTokenHash = newAccess, accessExpiresAt, rotatedAt = now`. `count === 1` -> return the new pair.
2. `count === 0` -> *grace:* read the grant by `prevRefreshTokenHash = h`; if found, not revoked, not expired, same client and `rotatedAt > now-30s`, run `updateMany where { id, prevRefreshTokenHash: h, rotatedAt: { gt: now-30s }, revokedAt: null }` setting `prevRefreshTokenHash = <the grant's current refreshTokenHash, i.e. the other racer's token>`, a new `refreshTokenHash`, a new access pair and `rotatedAt = now`. If this count is 0 someone else rotated meanwhile -> go to step 3.
3. `count === 0` -> read by `prevRefreshTokenHash = h` or `refreshTokenHash = h`: if found and outside the window -> revoke grant (`revokedAt = now`), `invalid_grant`; if not found anywhere -> `invalid_grant` (no revoke: cannot attribute).
In steps 1 and 2 verify `clientId` equals the authenticated client; scopes subset check happens before rotating.

*Why not return "the same pair"?* Only hashes are stored, so the earlier pair's plaintext is unrecoverable; storing it (even encrypted) adds a secret store and a key. Re-issuing is stateless. *Why not strict revoke?* A lost response (Cloudflare/network drop after our commit) or two parallel refreshes (a client with concurrent tool calls, or ChatGPT workers) would kill the grant and force re-consent. *Why not "invalid_grant without revoke" in the window?* The client that lost its response would be stuck with no token. *Cost:* the racer holding the first pair loses it when the second pair is minted; that racer's next refresh also falls in grace (its token is now `prev`) and converges, never revoking. Window is one rotation old only (`prev` holds a single hash), so the surface for a thief is "one stolen token, used within 30 s of its rotation".
*Fallback if `rotatedAt` is rejected:* drop step 2; strict revoke on any `prev` presentation (the canonical §4 behaviour) and accept the re-consent cost.

### D7. Revocation consistency
`verifyCredential` (flo_ branch) does a single `findFirst({ where: { accessTokenHash, revokedAt: null, accessExpiresAt: { gt: now }, OR: [expiresAt null | gt now] }, include user })` per request, no caching, so revoke is visible on the next request. A request already authenticated may finish (no in-flight cancellation). `/revoke` handler `revokeToken(client, { token })`: hash and match on `accessTokenHash | refreshTokenHash | prevRefreshTokenHash` AND `clientId = client.client_id`, set `revokedAt` via `updateMany`; unknown -> success. User/UI revoke uses `updateMany where { id, userId }`, `count 0` -> `notFound()`. Revocation is not undone by refresh (`revokedAt: null` is in every where).

### D8. CIMD client store (SSRF-safe)
`getClient(clientId)` -> cached or fetch; `clientsStore` has no `registerClient`. Module `oauth/providers/cimd/` (service + pure `ipGuard` util).
- URL checks: `new URL`, `https:`, empty username/password, no hash, port empty/443, pathname not `/`, hostname not an IP literal that fails the guard.
- Resolve **once** with `dns.lookup(host, { all: true, verbatim: true })`; reject if the list is empty or ANY address fails `isPublicAddress`.
- `isPublicAddress` (pure, unit-tested): IPv4 deny `0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4`; IPv6 allow only global unicast `2000::/3` minus `2001::/32` (Teredo), `2001:db8::/32`, `2002::/16` (6to4); any `::ffff:a.b.c.d` / `64:ff9b::/96` form is unwrapped and re-checked as IPv4. Built on `node:net` `BlockList` for subnet math plus explicit mapped-address unwrapping and tests for each family.
- **Connection-time pinning:** the https request is made with `https.request(url, { agent: new https.Agent({ keepAlive: false, lookup }) , servername: host })` where `lookup` is a function returning the already-validated address (resolved in the step above, validated as a set); the URL keeps the original hostname so SNI, certificate verification and `Host` are unchanged. There is no second DNS query, so rebinding cannot change what is dialled. (If a later Node version routes lookups differently, the spike test with a fake DNS asserts the dialled IP.) `autoSelectFamily` disabled to dial exactly that address.
- Response: `res.statusCode === 200` (3xx rejected: no redirect following), `content-type` starts `application/json`, whole-exchange timeout 5 s (`AbortSignal.timeout`), stream bytes counted and aborted above 64 KB, parsed with a Zod schema: `client_id` equals the URL, `redirect_uris` non-empty array of valid URIs (https, or http loopback), `client_name` optional (fallback: host), `token_endpoint_auth_method` absent or `none`. Errors are generic outward (`invalid_client`), detail only in logs (host, reason; never the body).
- Returned `OAuthClientInformationFull`: `client_id`, `client_name`, `redirect_uris`, `token_endpoint_auth_method: "none"`.
- **Loopback ports (only if task 1.3 shows Claude Code's document needs it):** the SDK checks `redirect_uris.includes(requested)`. Because `getClient` is not given the request, a tiny middleware ahead of `/authorize` and `/token` stores the requested `redirect_uri` in `AsyncLocalStorage`; `getClient` adds that URI to the returned list when it differs from a registered `http` loopback entry only by port. Everything else is exact match. At decision time (D3) the same function is re-applied.
- **Cache decision:** short in-memory `Map` keyed by URL, **5-minute TTL, 100 entries, successes only**. Justification: one flow calls `getClient` on authorize, token, and every hourly refresh/revoke; without a cache the flow depends on chatgpt.com being reachable each time and adds outbound fetches an unauthenticated caller can trigger at will (the cache bounds this to one fetch per client URL per 5 minutes; failures are not cached but the SDK limiter bounds retry rate). A 5-minute lag for a changed document is irrelevant; grants snapshot `redirectUri` and `clientName`, so a later doc change cannot widen existing grants. No persistence.

### D9. Framing protection for the consent route
The SPA is served by `vite preview` behind the Node gateway (prod) or directly (dev), not by Express/helmet, so the API cannot set it. Minimal: (1) set `preview.headers` and `server.headers` in `apps/web/vite.config.ts` to `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` (headers pass through `http-proxy`; the whole SPA is never legitimately framed); (2) JS fallback in the consent page: `if (window.top !== window.self)` render a "open in a new tab" message with no actions. Verification task: `curl -I` the dev and prod web hosts after deploy. No gateway change planned; if the gateway strips the header, the JS fallback still holds and a follow-up is logged.

### D10. Verify path for `flo_`
`verifyCredential`: token starting `flo_` -> hashed lookup per D7 -> `VerifiedCredential { kind: "oauth", credentialId: grant.id, scopes: grant.scopes, userId, email }`; `lastUsedAt` through the shared throttled conditional `updateMany` (same helper as ApiKey). `flr_`, JWTs and unknown prefixes throw `HttpError(401)` (the shared `verifyCredential` error contract; add-mcp-server's verifier maps it to `InvalidTokenError`). `/v1` keeps rejecting `flo_` because its middleware only accepts `fl_`... implemented as a `kinds` option on the shared verifier call in `requireCredential` (`/v1` passes `["apiKey"]`; `/mcp` default both). No MCP adapter change.

### D11. Web
- `ProtectedRoute` navigates to `/login?redirect=<encodeURIComponent(pathname+search)>`; `LoginPage` reads `redirect`, validates with one shared helper `safeRedirect()` (must start with a single `/`, not `//`, no backslash, parsed with `new URL(x, origin).origin === origin`; default dashboard), navigates there after login, and passes it to `GoogleOAuthButton`. `OAuthCallbackPage` reuses the same helper. The consent route is declared outside `AppLayout` and wrapped in `ProtectedRoute`.
- `OAuthAuthorizePage` (`pages/OAuthAuthorize/`): `useOAuthConsentContext` (GET context) and `useOAuthDecision` mutation in `oauthAuthorize.client.ts`; `window.location.assign(redirectUrl)` after success. "Not you?" calls the existing logout then navigates to `/login?redirect=<consent URL>`. Lifetime radios reuse the shared enum and labels from the API-keys form (extract if already a component, else import). Warning for Never uses an icon + text.
- Connected apps: `oauthGrants.client.ts`, `useOAuthGrants` hooks (invalidate on revoke), `ConnectedAppsSection` in the Developer page using the same native `<dialog>` confirm as API-key revoke.

### D12. Testing strategy
Unit (`mockDeep<PrismaClient>`): provider `authorize/challenge/exchange/refresh/revoke` (replay, concurrency count 0, grace, late reuse, scope subset, clock-capped expiry with fake timers), consent request sign/verify, decision service, grants read/delete services, `verifyCredential` flo_ branch. CIMD: `ipGuard` table tests for every range and mapped form; fetch service with mocked `dns.lookup` and a local HTTPS test server for pinning (assert dialled IP equals the validated one even when a second lookup would differ), redirect, size, content-type, timeout, id mismatch. Integration (supertest + testcontainers, Docker via the Vagrant VM): full flow with PKCE using a stub CIMD (injectable fetch/test host allowance behind a test-only seam, never an env flag in prod code), plus deny, replay, wrong verifier/redirect/resource, expiry cap, Never rotation, refresh reuse, UI revoke -> `/mcp` 401. Web (RTL + msw): consent page states (default unticked write, Never warning, framed, error), login redirect preservation incl. open-redirect inputs, Connected apps list/revoke/empty. Manual: ChatGPT and Claude Code against `api-flowledger-dev.razs.dev` with the dev web host running; `curl -I` for frame headers.

## Risks / Trade-offs

- **SDK/Express 4 interplay and missing `iss`** -> spike first (task 1); fallback is to mount only the SDK handler exports with our own metadata.
- **Real-client quirks** (ChatGPT/Claude Code metadata expectations, loopback ports, `resource` on token calls) -> manual acceptance with both; DCR stays in the deferred list if CIMD fails.
- **Grace window weakens theft detection slightly** for 30 s -> bounded to the single previous token; documented.
- **Consent requests replayable for 10 min** -> each use needs a fresh explicit approval and goes to the registered redirect only.
- **Frame header relies on the web host** -> JS fallback guarantees the buttons never render framed.
- **Outbound fetch is a new attack surface** -> centralised guard, pinning, size/time caps, cache bound.
- **Unfinished-grant rows** -> opportunistic cleanup in the decision service.

## Open Questions

1. **Resolved (owner-approved 2026-10-29):** `OAuthGrant` gains `rotatedAt DateTime?` for D6's 30 s grace. A grace-window retry always rotates the single chain on the grant (it never re-issues from an old token into an independent chain and never extends `grant.expiresAt`). Endpoints are the SDK's root `/authorize`, `/token`, `/revoke`, with their exact URLs advertised in the authorization-server metadata.
2. Final endpoint paths (`/authorize`, `/token`, `/revoke` at the API root vs the canonical text mentioning `/oauth/*`) - confirmed by the spike; clients discover them from metadata.
3. **Resolved (spike, 2026-10-30):** Claude Code's document (`https://claude.ai/oauth/claude-code-client-metadata`) lists `http://localhost/callback` and `http://127.0.0.1/callback` with `token_endpoint_auth_method: none`; the SDK's own `redirectUriMatches` already relaxes loopback ports, so the `AsyncLocalStorage` shim is not built. ChatGPT's document (`https://chatgpt.com/oauth/client.json`) declares `token_endpoint_auth_method: private_key_jwt` with `token_endpoint_auth_methods_supported: ["none","private_key_jwt"]`: the D8 rule is relaxed to accept a document whose declared method is `none` OR whose supported list includes `none`; the client is treated as public (PKCE only). The SDK `mcpAuthRouter` runs in Express 4 with only `getClient` (no `/register`), enforces S256, and is mounted before the app-wide CORS so its open CORS is not overwritten. `https.Agent` custom `lookup` pinning is proven by the CIMD unit test (the dialled address is the validated one; a later DNS answer is never requested). Token calls: `resource` is required on code exchange and, when sent, checked on refresh.

## Simplicity audit

Question: is this the smallest standards-compliant design for ChatGPT + Claude Code?

- KEEP: SDK `mcpAuthRouter` (PKCE, limiter, token/revoke plumbing for free); CIMD-only store (no DCR table); single `OAuthGrant` table; signed consent JWT (reuses the Google-state pattern, no state table); atomic `updateMany` rotation and code claim (DB does the locking); connection-pinned SSRF fetch and `ipGuard` (security, not optional); 5-minute `Map` cache (about 10 lines, bounds outbound fetches); `iss` on our redirects (ChatGPT requires it); frame header plus JS fallback.
- KEEP (with fallback): 30 s refresh grace via `rotatedAt`. One column and one extra update; avoids revoking on lost responses or parallel refreshes. If Opus rejects the column, strict revoke is the documented fallback.
- SIMPLIFY: the loopback-port `AsyncLocalStorage` shim is now built only if the spike shows Claude Code's document needs it. `safeRedirect()` lives in web utils only (the API never needs it).
- DEFER: opportunistic cleanup of unfinished grants (harmless rows, add a cron or `deleteMany` when volume matters); `iss` on SDK-generated error redirects; DCR.
- REMOVE: nothing further. No client table, token table, jti store, remembered consent, OIDC, or audit table.
