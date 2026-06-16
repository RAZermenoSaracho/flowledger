# Auth Flow

---

## Overview

FlowLedger uses JWT-based stateless authentication. There are two auth methods:

1. **Email/password** — user registers with a password, logs in with credentials
2. **Google OAuth** — redirect-based OAuth 2.0 flow with PKCE-style nonce protection

There is no session store. Tokens are validated on every request by the `requireAuth` middleware.

---

## JWT

- Signed with `JWT_SECRET` (minimum 16 characters)
- Expiry: `JWT_EXPIRES_IN` (default `"7d"`)
- Payload: `{ sub: userId, email }`
- Algorithm: `jsonwebtoken` default (HS256)

Tokens are stored by the frontend in `localStorage` under the key `"flowledger.token"` and sent as `Authorization: Bearer <token>` on every API request.

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
4. Return `{ token, user }` (user excludes `passwordHash`)

### Login

```
POST /auth/login
Body: { email, password }
```

1. Find user by email
2. Compare password against `passwordHash` with `bcrypt.compare`
3. Return 401 for invalid email or wrong password (same error to prevent user enumeration)
4. Return `{ token, user }`

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
8. Clear the nonce cookie
9. Redirect to `<WEB_APP_URL>/auth/oauth/callback#token=<JWT>&redirect=<destination>`

### Step 3 — Frontend completes login

`OAuthCallbackPage` reads `token` and `redirect` from the URL hash fragment, stores the token, and navigates to the redirect destination.

---

## `requireAuth` Middleware

Located: `apps/api/src/middleware/auth.ts`

```
Authorization: Bearer <token>
```

1. Extract token from `Authorization` header
2. `jwt.verify(token, JWT_SECRET)` — throws on invalid/expired
3. Set `req.user = { id: payload.sub, email: payload.email }`
4. Call `next()`

On failure: passes `HttpError(401)` to error handler.

The middleware is applied per-router, not globally. The `/providers/webhooks` and `/auth` routes are intentionally unauthenticated.

---

## User serialization

The `publicUser()` utility in `utils/serialize.ts` strips `passwordHash` before returning user data in any response. This is applied in `/auth/register`, `/auth/login`, and `/auth/me`.

---

## Session endpoint

```
GET /auth/me
```

Requires auth. Fetches the current user from the database and returns the public user object. Used by the frontend on app load to restore session state.

---

## OAuth providers implemented

| Provider | Status |
|---|---|
| Google | Implemented |
| GitHub | Not implemented (referenced in older docs but no code exists) |

---

## Security notes

- Passwords are hashed with bcrypt (cost factor 12)
- The nonce in the OAuth cookie prevents CSRF during the OAuth handshake
- The nonce cookie is scoped to `Path=/auth/google/callback` to limit exposure
- The cookie is `Secure` in production
- OAuth state carries the redirect destination inside a short-lived signed JWT — it cannot be forged
- `passwordHash` is never included in API responses
