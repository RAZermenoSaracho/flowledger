# Auth Flow

---

## Overview

FlowLedger uses a short-lived JWT access token paired with an opaque, rotating refresh token. There are two ways to establish a session:

1. **Email/password** — user registers with a password, logs in with credentials
2. **Google OAuth** — redirect-based OAuth 2.0 flow with CSRF nonce protection

Both paths issue the same access+refresh token pair. There is no server-side session store beyond the `RefreshToken` table; the access token itself is stateless and validated on every request by the `requireAuth` middleware.

---

## Token model

| | Access token | Refresh token |
|---|---|---|
| Format | JWT, signed with `JWT_SECRET` | Opaque, high-entropy (`crypto.randomBytes(48)`, base64url) |
| Expiry | `JWT_EXPIRES_IN` (default `"15m"`) | Persistent: `REFRESH_TOKEN_EXPIRES_IN_DAYS` (default `30`). Browser session: 24 hours. Each refresh renews the full period |
| Payload | `{ sub: userId, email }` | None — the value itself is the credential |
| Storage (server) | Not stored — verified by signature | SHA-256 hash stored in `RefreshToken.tokenHash` (a fast deterministic hash is sufficient since the token is already high-entropy, unlike a user-chosen password) |
| Storage (frontend) | In-memory only (`tokenStore` in `apps/web/src/services/api.client.ts`) — never `localStorage`, cleared on page reload | httpOnly cookie — never touched by JS |
| Sent as | `Authorization: Bearer <token>` header | Cookie, automatically attached by the browser (`credentials: "include"`) |

Deliberately not persisting the access token means a page reload always starts with no token in memory; the frontend recovers a session via a silent `POST /auth/refresh` call that relies solely on the refresh cookie (see "Frontend session handling" below).

`apps/api/src/modules/auth/utils/tokens.ts` owns `signAccessToken`, `generateRefreshToken`, and `hashRefreshToken`.

---

## Refresh token cookie

Built/read by `apps/api/src/modules/auth/utils/refreshTokenCookie.ts`.

- Name: `flowledger_refresh_token` in production, `flowledger_dev_refresh_token` elsewhere, because environments on sibling subdomains share one cookie domain and would otherwise overwrite each other's session
- `HttpOnly` — inaccessible to JavaScript
- `SameSite=Strict`
- `Path=/auth` — only sent on `/auth/*` requests (refresh, logout), not on every API call
- `Max-Age` derived from the refresh token's `expiresAt` for a persistent session; omitted for a browser session
- No `Domain` attribute — host-only, so only the API host receives it. Each session response also expires any older copy scoped to `REFRESH_TOKEN_COOKIE_DOMAIN`
- `Secure` in production and on any deployment whose `WEB_APP_URL` uses HTTPS

### Session presence cookie

A rejected refresh (401) expires only the presence cookie, never the refresh cookie, because another tab's rotation may have just set a valid one. The next successful refresh sets it again.

`Path=/auth` means browsers never send the refresh cookie on `/`, so the `flowledger_landing` gateway cannot use it to choose between the landing page and the app. The API therefore also sets `flowledger_session=1` (`flowledger_dev_session` outside production): `HttpOnly`, `SameSite=Lax` so a link from another site still reaches the app, `Path=/`, same `Domain`, `Secure`, and lifetime as the refresh cookie. It holds no credential and only says a session probably exists; the app still validates it through `/auth/refresh`.

## Session modes

| | Keep me logged in (default) | Unchecked |
|---|---|---|
| Cookie | Persistent `Max-Age` | Browser-session, no `Max-Age` |
| Server lifetime | 30 days, sliding | 24 hours, sliding |

`RefreshToken.persistent` records the mode, and rotation copies it. Mobile browsers and session restore can keep session cookies indefinitely, so the server lifetime is the real limit on an unchecked session. `/auth/login` and Google sign-in take the checkbox value; omitted means persistent. Registration is always persistent.

---

## Email/Password Flow

### Registration

```
POST /auth/register
Body: { name, email, password }
```

1. Check for existing user by email → 409 if found
2. Hash password with `bcryptjs` (12 rounds)
3. Create `User` record
4. Issue an access+refresh token pair (`registerUser` in `services/create.service.ts`)
5. Set the refresh token cookie
6. Return `201` with `{ token, user }` (user excludes `passwordHash`) — `token` is the access token

### Login

```
POST /auth/login
Body: { email, password, keepLoggedIn? }
```

1. Find user by email
2. Compare password against `passwordHash` with `bcrypt.compare` — a Google-only account (no `passwordHash`) always fails this check
3. Return 401 for invalid email or wrong password (same error to prevent user enumeration)
4. Issue an access+refresh token pair, set the refresh token cookie, return `{ token, user }`

---

## Google OAuth Flow

### Step 1 — Initiate

```
GET /auth/google?redirect=<destination>&keepLoggedIn=<true|false>
```

1. Generate a random 32-byte nonce
2. Sign `{ nonce, redirect, keepLoggedIn }` as a short-lived JWT (audience `"google-oauth"`, 10-minute expiry) → `state`
3. Set `HttpOnly; SameSite=Lax; Path=/auth/google/callback` cookie containing the nonce (URL-encoded)
4. Build Google authorization URL with `response_type=code`, `scope=openid email profile`, `prompt=select_account`
5. Redirect to Google

### Step 2 — Callback

```
GET /auth/google/callback?code=<code>&state=<state>
```

1. Verify the `state` JWT (audience `"google-oauth"`)
2. Compare nonce from state with cookie → reject if mismatch (CSRF protection)
3. Exchange `code` for Google tokens (`POST https://oauth2.googleapis.com/token`)
4. Verify `id_token`: check `aud == GOOGLE_CLIENT_ID`, `iss` in Google's issuer list, `email_verified == true`
5. Fetch user info from `https://openidconnect.googleapis.com/v1/userinfo`
6. Verify sub/email consistency between id_token and userinfo
7. `findOrCreateGoogleUser`: look up `UserAuthAccount` by `(provider="google", providerAccountId)` → enter that user if linked; otherwise refuse with 409 if any account has the email in any letter case; otherwise create User + UserAuthAccount. Email never links an identity
8. Issue an access+refresh token pair exactly like a regular login (`handleGoogleCallback` in `providers/google/services/create.service.ts`)
9. Clear the nonce cookie, set the refresh token cookie
10. Redirect to `<WEB_APP_URL>/auth/oauth/callback#redirect=<destination>`. No token appears in the URL

### Step 3 — Frontend completes login

`OAuthCallbackPage` reads `redirect` from the URL hash fragment and removes the fragment. The redirect carries no token: `AuthProvider`'s normal session restore calls `/auth/refresh` with the cookie the callback just set, and the page then navigates once to the destination. A 401 shows a sign-in error with a link to login; a network error or 5xx shows a connection message and keeps retrying.

---

## `POST /auth/refresh`

Controller: `apps/api/src/modules/auth/controllers/update.controller.ts`. Not behind `requireAuth` — authenticated by the refresh cookie instead.

1. Read the refresh token from the `flowledger_refresh_token` cookie → 401 if absent
2. `rotateRefreshToken` (`services/update.service.ts`):
   - Hash the plaintext value and look up the `RefreshToken` row; 401 if missing, revoked, or expired
   - Issue a new access+refresh token pair in the same session mode, with `previousTokenId` pointing at the presented row
   - Revoke the presented row's own predecessor, because using this token proves the client received it
3. Set the session cookies, return `{ token, user }`

A token stays valid until its successor is first used, then it is rejected. That covers a response lost to a network drop or app suspension, however long the device takes to return, and parallel refreshes from several tabs. Siblings created this way expire on their own; no client holds them, because the cookie store keeps one value. There is no reuse alarm (`docs/KNOWN_ISSUES.md` #007).

The MCP OAuth server has its own rotation with a 30-second grace window (see below), which suits server clients that retry immediately.

## `POST /auth/logout`

Controller: `apps/api/src/modules/auth/controllers/delete.controller.ts`. Also unauthenticated by design — a client with an expired access token still needs to be able to log out.

1. Read the refresh token from the cookie, if present
2. Revoke the matching `RefreshToken` row, its predecessor, and any token issued from it, so a refresh in flight can't outlive the logout (`revokeRefreshToken` — no-op if the token doesn't exist). Other devices are unaffected
3. Clear both session cookies
4. Always responds `204`, even if there was nothing to revoke, so logout can't itself fail visibly

## `PATCH /auth/password`

Requires auth. Mounted under `/auth` so the refresh cookie identifies the current device; the controller and service live in the `users` module.

1. Verify the current password → `400` if wrong
2. In one transaction, update the hash and revoke all the user's refresh tokens except the current device's (or all of them when no cookie is present)
3. Respond `204`

Access JWTs on other devices stay valid until they expire, up to `JWT_EXPIRES_IN`. API keys and MCP OAuth grants are managed separately and aren't revoked.

---

## Frontend session handling

### `tokenStore` (`apps/web/src/services/api.client.ts`)

In-memory getter/setter/clearer for the access token only. Not persisted, by design — see "Token model" above. Versions before 2026-08-10 kept the token in `localStorage["flowledger.token"]`; `AuthProvider` deletes that entry on every load (`clearLegacyStoredToken` in `auth.client.ts`).

### `AuthProvider` (`apps/web/src/hooks/useAuth.tsx`)

On mount, calls `authClient.refreshSession()` (`POST /auth/refresh`) to attempt to restore a session from the refresh cookie. On success, stores the returned access token and sets `user`. On a 401, leaves the user signed out. On a network error or other failure, it sets `isSessionUnavailable` and retries every 5 seconds, and `ProtectedRoute` shows a connection message instead of redirecting. `isInitializing` stays `true` until the first attempt settles, so protected routes and `LoginPage` wait for it; `LoginPage` sends a signed-in user straight to `redirect`.

### `apiRequest` 401 retry (`apps/web/src/services/api.client.ts`)

Every authenticated request goes through `apiRequest`, which attaches `Authorization: Bearer <token>` from `tokenStore` and always sends `credentials: "include"` (so the refresh cookie rides along, even though it's scoped to `/auth` and thus only actually sent on refresh/logout calls). If a request comes back `401` from a non-`/auth/*` path, or from `/auth/password`, `apiRequest` calls `refreshAccessToken()` once, and if that succeeds, retries the original request with the new access token. `refreshAccessToken()` de-dupes concurrent callers onto a single in-flight `POST /auth/refresh` request so a burst of parallel requests after token expiry doesn't trigger a burst of refresh calls.

Only a `401` from `/auth/refresh` ends the session: it clears the token and notifies `AuthProvider`, and route guards then redirect. A network error or other failure leaves the session in place, the caller sees the original error, and a later request can refresh.

---

## Connecting Google to an existing account

`POST /auth/google/link` (behind `requireAuth`) returns the Google URL and sets the nonce cookie, with the signed state carrying `linkUserId`. The callback then creates only the link, issues no session, and returns to `/profile?tab=security&googleLink=connected|conflict|failed`. An identity linked to another account, or a user already linked to a different identity, gets `conflict`, which never names the other account. `GET /auth/google/link` reports `{ connected }`.

## Changing email

`PATCH /auth/email` needs the current password, and in one transaction updates the email and revokes every other refresh token, keeping this device (the refresh cookie identifies it). It returns a new access token, because the old one embeds the previous email. `PATCH /users/me` rejects a different email, and `/v1` and MCP can't change it. An account with no password can't change its email.

## Abuse resistance

Limits are in `auth/utils/authRateLimits.ts`, and a 429 doesn't end a session because only a 401 does:

| Route | Key | Limit |
|---|---|---|
| `POST /auth/login` | Client address + email, failures only | 10 per 15 min |
| `POST /auth/login` | Client address | 50 per 15 min |
| `POST /auth/register` | Client address | 10 per hour |
| `POST /auth/refresh` | Client address | 60 per min |
| `PATCH /auth/password`, `PATCH /auth/email` | User | 10 per 15 min |

`requireWebOrigin` rejects a foreign `Origin` with 403 on register, login, refresh, logout, and credential changes; a request with no `Origin` passes. Login does one bcrypt comparison whether or not the account or its password exists.

Presenting a refresh token revoked more than 60 seconds ago also revokes everything issued from it. Inside that minute it may be a request in flight during a rotation, so descendants stay valid. Issuing a token deletes the user's expired rows and keeps revoked unexpired ones, so a replay can still be recognized.

---

## `requireAuth` Middleware

Located: `apps/api/src/middleware/auth.ts`. Unchanged by the refresh-token migration — it only ever validates the access token.

```
Authorization: Bearer <token>
```

1. Extract token from `Authorization` header
2. `verifyAccessToken(token)` (`auth/utils/tokens.ts`) — throws unless the signature and expiry are valid, the audience is `flowledger-access`, the algorithm is HS256, `sub` is a non-empty string, and `email` is a string
3. Set `req.user` to the returned `{ id, email }`
4. Call `next()`

On failure: passes `HttpError(401)` to error handler.

### Token purposes

All JWTs share `JWT_SECRET`, so every verifier names its audience and algorithm, and each purpose is rejected by the others.

| Purpose | Audience | Signed in | Verified in |
|---|---|---|---|
| Access token | `flowledger-access` | `auth/utils/tokens.ts` | `verifyAccessToken` |
| Google OAuth state | `google-oauth` | `auth/providers/google/utils/googleState.ts` | `verifyGoogleState` |
| MCP consent request | `oauth-consent` | `oauth/utils/consentRequest.ts` | `verifyConsentRequest` |

The subject check matters because Prisma removes `undefined` from a `where`, so a request with no user id would otherwise lose its owner filter.

The middleware is applied per-router, not globally. The `/providers/webhooks` and `/auth` routes are intentionally unauthenticated — `/auth/refresh` and `/auth/logout` in particular rely on the refresh cookie instead.

---

## User serialization

The `publicUser()` utility in `utils/serialize.ts` strips `passwordHash` before returning user data in any response. This is applied everywhere a user object is returned: `/auth/register`, `/auth/login`, `/auth/refresh`, the Google callback, and `/auth/me`.

---

## Session endpoint

```
GET /auth/me
```

Requires auth (access token). Fetches the current user from the database and returns the public user object. Used by the frontend after both a silent refresh and the OAuth callback to populate `user` in `AuthContext`.

---

## Personal API keys

Keys have the form `fl_` + 32 random bytes encoded as base64url. Only a SHA-256 hash is stored; the plaintext is returned once by `POST /users/me/api-keys`. `GET /users/me/api-keys` lists keys, and `DELETE /users/me/api-keys/:id` revokes one idempotently. These management routes use `requireAuth` and accept web JWTs only; an `fl_` key receives 401.

`apps/api/src/middleware/credential.ts` exports `verifyCredential` (the `fl_` branch rejects unknown, revoked, or expired keys and JWTs), `requireCredential`, and `requireScope('read' | 'write')`. Write scope implies read; insufficient scope returns 403. `lastUsedAt` updates at most once every five minutes without blocking the request. Credential middleware is not yet mounted on any public route.

`PUBLIC_API_URL` defaults to `http://localhost:${API_PORT}`. The app sets `trust proxy` to `1`; `apps/api/src/utils/rateLimit.ts` provides `createRateLimiter`, and `apps/api/src/utils/auditLog.ts` provides audit logging helpers.

---

## MCP OAuth server

FlowLedger is an OAuth 2.1 authorization server for `/mcp` (module `apps/api/src/modules/oauth/`), so ChatGPT and Claude Code can connect without a pasted key.

- **Discovery** (API host): `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource` and `.../mcp`; a `/mcp` 401 carries `WWW-Authenticate: Bearer resource_metadata=...`. Endpoints are the SDK's root `/authorize`, `/token`, `/revoke`. No `/register`.
- **Clients** are Client ID Metadata Documents only (`oauth/providers/cimd/`): the `client_id` is an https URL fetched with an SSRF-safe, DNS-pinned request (5 s, 64 KB, no redirects, every resolved address must be public; results cached 5 min). A document declaring `private_key_jwt` is accepted when it also lists `none`, and is treated as a public client.
- **Flow**: `/authorize` (PKCE S256, `resource` must equal `${PUBLIC_API_URL}/mcp`, exact redirect or loopback with any port) redirects to `${WEB_APP_URL}/oauth/authorize?req=<10-minute signed JWT>`. The SPA calls `GET /oauth/authorize/context` and `POST /oauth/authorize/decision` (web JWT only); the decision binds the grant to the signed-in user and returns `redirect_uri?code&state&iss`. Read is always granted; write only if requested and ticked. Lifetime: 1d, 1m, 1y or never.
- **Tokens**: 60 s single-use code (replay revokes the grant); `flo_` access token (1 h, never past the grant) and rotating `flr_` refresh token. Re-presenting the previous refresh token within 30 s of its rotation issues a fresh pair; later it revokes the grant. Refreshing never extends the grant.
- **Verification**: `verifyCredential` checks the `flo_` token against the database on every request, so revocation is immediate. `/v1` passes `kinds: ["apiKey"]` and rejects OAuth tokens.
- **Management**: `GET /users/me/oauth-grants` and `DELETE /users/me/oauth-grants/:id` (web JWT), or the client's `/revoke`.
- Google login accepts a same-origin relative `redirect` up to 2048 characters (the consent URL), so a logged-out user returns to the consent page.
- **Meta AI Muse.** Muse asks for a Client ID but hosts no client document, so FlowLedger serves one at `${PUBLIC_API_URL}/oauth/clients/meta-muse.json`. It is a public client with no secret, whose only redirect is `https://agent.meta.ai/api/hatch/oauth/callback`. The document's URL is Muse's Client ID, and the normal CIMD pipeline handles it: exact redirect match, PKCE S256, consent, scopes, rotation and revocation.
  - Values to enter for production:
    - MCP server URL: `https://api-flowledger.razs.dev/mcp`
    - OAuth Client ID: `https://api-flowledger.razs.dev/oauth/clients/meta-muse.json`
    - Client secret: none (public client)
    - Authorization URL: `https://api-flowledger.razs.dev/authorize`
    - Token URL: `https://api-flowledger.razs.dev/token`
    - Scopes: `read write offline_access`. FlowLedger offers "Allow changes" on the consent page only when `write` is requested. Without it, the grant is read-only.
    - Callback: `https://agent.meta.ai/api/hatch/oauth/callback`
  - Staging uses the same values on `api-flowledger-dev.razs.dev`.
  - Muse connectors must be submitted on platform.muse.ai and approved by Meta before users can add them.
  - If Muse turns out to require a client secret or dynamic registration, it cannot connect. FlowLedger supports neither by design.
- **Grok.** Grok.com connectors are a standard CIMD client (`https://grok.com/oauth/mcp-client.json`, public, redirect `https://grok.com/connectors-oauth-exchange-code/`) and need no FlowLedger change. The xAI API's remote MCP tool sends a caller-supplied token and does no OAuth flow, so use a personal API key there (see `docs/PUBLIC_API.md`).

---

## OAuth providers implemented

| Provider | Status |
|---|---|
| Google | Implemented |
| GitHub | Not implemented (referenced in older docs but no code exists) |

---

## Security notes

- Passwords are hashed with bcrypt (cost factor 12)
- Refresh tokens are opaque and stored only as a SHA-256 hash — a database leak doesn't expose usable tokens directly
- Refresh tokens rotate on every `/auth/refresh`; a token is rejected once its successor has been used
- Changing a password revokes the user's other refresh tokens
- The refresh cookie is `HttpOnly` (no JS access), `SameSite=Strict` (not sent on cross-site navigations or requests), and scoped to `Path=/auth` (not attached to every API call). The session presence cookie carries no credential
- The access token is kept in memory on the frontend, never in `localStorage`/`sessionStorage`, limiting exposure to XSS reading persisted storage
- The nonce in the OAuth cookie prevents CSRF during the OAuth handshake
- The nonce cookie is scoped to `Path=/auth/google/callback` to limit exposure
- Both the refresh and nonce cookies are `Secure` in production
- OAuth state carries the redirect destination inside a short-lived signed JWT — it cannot be forged
- `passwordHash` is never included in API responses
