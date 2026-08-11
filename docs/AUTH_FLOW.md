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
| Expiry | `JWT_EXPIRES_IN` (default `"15m"`) | `REFRESH_TOKEN_EXPIRES_IN_DAYS` (default `30`) |
| Payload | `{ sub: userId, email }` | None — the value itself is the credential |
| Storage (server) | Not stored — verified by signature | SHA-256 hash stored in `RefreshToken.tokenHash` (a fast deterministic hash is sufficient since the token is already high-entropy, unlike a user-chosen password) |
| Storage (frontend) | In-memory only (`tokenStore` in `apps/web/src/services/api.client.ts`) — never `localStorage`, cleared on page reload | httpOnly cookie — never touched by JS |
| Sent as | `Authorization: Bearer <token>` header | Cookie, automatically attached by the browser (`credentials: "include"`) |

Deliberately not persisting the access token means a page reload always starts with no token in memory; the frontend recovers a session via a silent `POST /auth/refresh` call that relies solely on the refresh cookie (see "Frontend session handling" below).

`apps/api/src/modules/auth/utils/tokens.ts` owns `signAccessToken`, `generateRefreshToken`, and `hashRefreshToken`.

---

## Refresh token cookie

Built/read by `apps/api/src/modules/auth/utils/refreshTokenCookie.ts`.

- Name: `flowledger_refresh_token`
- `HttpOnly` — inaccessible to JavaScript
- `SameSite=Strict`
- `Path=/auth` — only sent on `/auth/*` requests (refresh, logout), not on every API call
- `Max-Age` derived from the refresh token's `expiresAt`
- `Domain=REFRESH_TOKEN_COOKIE_DOMAIN` when set (e.g. `.razs.dev` in `.env.example`) — scopes the cookie to the parent domain rather than the API's own host, so it's readable by other subdomains under the same registrable domain
- `Secure` when `NODE_ENV=production`

Because the cookie is domain-scoped rather than host-scoped, `flowledger_landing`'s gateway (on a sibling subdomain) can detect the presence of this cookie to tell whether a visitor already has a FlowLedger session, without either app sharing tokens directly.

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
Body: { email, password }
```

1. Find user by email
2. Compare password against `passwordHash` with `bcrypt.compare` — a Google-only account (no `passwordHash`) always fails this check
3. Return 401 for invalid email or wrong password (same error to prevent user enumeration)
4. Issue an access+refresh token pair, set the refresh token cookie, return `{ token, user }`

---

## Google OAuth Flow

### Step 1 — Initiate

```
GET /auth/google?redirect=<destination>
```

1. Generate a random 32-byte nonce
2. Sign `{ nonce, redirect }` as a short-lived JWT (audience `"google-oauth"`, 10-minute expiry) → `state`
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
7. `findOrCreateGoogleUser`: look up `UserAuthAccount` by `(provider="google", providerAccountId)` → create User + UserAuthAccount if new, link to existing user by email if partial match
8. Issue an access+refresh token pair exactly like a regular login (`handleGoogleCallback` in `providers/google/services/create.service.ts`)
9. Clear the nonce cookie, set the refresh token cookie
10. Redirect to `<WEB_APP_URL>/auth/oauth/callback#token=<accessToken>&redirect=<destination>` — only the access token travels through the URL fragment; the refresh token was already set as a cookie on this same response

### Step 3 — Frontend completes login

`OAuthCallbackPage` reads `token` and `redirect` from the URL hash fragment, stores the access token in `tokenStore` via `setToken`, calls `GET /auth/me` to fetch the user, and navigates to the redirect destination. The refresh cookie is already present from step 2, so subsequent silent refreshes work the same as for email/password logins.

---

## `POST /auth/refresh`

Controller: `apps/api/src/modules/auth/controllers/update.controller.ts`. Not behind `requireAuth` — authenticated by the refresh cookie instead.

1. Read the refresh token from the `flowledger_refresh_token` cookie → 401 if absent
2. `rotateRefreshToken` (`services/update.service.ts`):
   - Hash the plaintext value and look up the `RefreshToken` row; 401 if missing, revoked, or expired
   - Mark that row `revokedAt` (rotation — a refresh token is single-use)
   - Issue a brand-new access+refresh token pair for the same user
3. Set the new refresh token cookie, return `{ token, user }`

Rotation means a stolen-and-replayed refresh token is only usable once before the legitimate client's next refresh attempt fails, which is a detectable signal of compromise (not currently alerted on, just structurally possible).

## `POST /auth/logout`

Controller: `apps/api/src/modules/auth/controllers/delete.controller.ts`. Also unauthenticated by design — a client with an expired access token still needs to be able to log out.

1. Read the refresh token from the cookie, if present
2. Revoke the matching `RefreshToken` row (`revokeRefreshToken` — no-op if it doesn't exist or is already revoked)
3. Clear the cookie
4. Always responds `204`, even if there was nothing to revoke, so logout can't itself fail visibly

---

## Frontend session handling

### `tokenStore` (`apps/web/src/services/api.client.ts`)

In-memory getter/setter/clearer for the access token only. Not persisted, by design — see "Token model" above.

### `AuthProvider` (`apps/web/src/hooks/useAuth.tsx`)

On mount, calls `authClient.refreshSession()` (`POST /auth/refresh`) to attempt to restore a session from the refresh cookie. On success, stores the returned access token and sets `user`; on failure (no cookie, or an expired/revoked refresh token), leaves the user signed out. Exposes `isInitializing`, which stays `true` until this attempt settles — protected routes should wait for it before redirecting to `/login`, otherwise a valid session would flash a login redirect on every page load.

### `apiRequest` 401 retry (`apps/web/src/services/api.client.ts`)

Every authenticated request goes through `apiRequest`, which attaches `Authorization: Bearer <token>` from `tokenStore` and always sends `credentials: "include"` (so the refresh cookie rides along, even though it's scoped to `/auth` and thus only actually sent on refresh/logout calls). If a non-`/auth/*` request comes back `401`, `apiRequest` calls `refreshAccessToken()` once, and if that succeeds, retries the original request with the new access token. `refreshAccessToken()` de-dupes concurrent callers onto a single in-flight `POST /auth/refresh` request so a burst of parallel requests after token expiry doesn't trigger a burst of refresh calls.

If the retried request still fails (refresh itself failed), the caller sees the original error — there is no automatic redirect to `/login` from `apiRequest` itself; that's left to route guards reacting to the absence of a user.

---

## `requireAuth` Middleware

Located: `apps/api/src/middleware/auth.ts`. Unchanged by the refresh-token migration — it only ever validates the access token.

```
Authorization: Bearer <token>
```

1. Extract token from `Authorization` header
2. `jwt.verify(token, JWT_SECRET)` — throws on invalid/expired
3. Set `req.user = { id: payload.sub, email: payload.email }`
4. Call `next()`

On failure: passes `HttpError(401)` to error handler.

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

## OAuth providers implemented

| Provider | Status |
|---|---|
| Google | Implemented |
| GitHub | Not implemented (referenced in older docs but no code exists) |

---

## Security notes

- Passwords are hashed with bcrypt (cost factor 12)
- Refresh tokens are opaque and stored only as a SHA-256 hash — a database leak doesn't expose usable tokens directly
- Refresh tokens are single-use: every `/auth/refresh` call revokes the old row and issues a new one (rotation)
- The refresh cookie is `HttpOnly` (no JS access), `SameSite=Strict` (not sent on cross-site navigations or requests), and scoped to `Path=/auth` (not attached to every API call)
- The access token is kept in memory on the frontend, never in `localStorage`/`sessionStorage`, limiting exposure to XSS reading persisted storage
- The nonce in the OAuth cookie prevents CSRF during the OAuth handshake
- The nonce cookie is scoped to `Path=/auth/google/callback` to limit exposure
- Both the refresh and nonce cookies are `Secure` in production
- OAuth state carries the redirect destination inside a short-lived signed JWT — it cannot be forged
- `passwordHash` is never included in API responses
