## Context

Link flow today:

1. The web app calls `POST /auth/google/link` with a bearer token. The API signs state `{nonce, redirect:"/profile", keepLoggedIn, linkUserId}`, sets the nonce cookie (`HttpOnly; SameSite=Lax; Path=/auth/google/callback`), and returns the Google URL.
2. The browser navigates to Google, then back to `GET /auth/google/callback`.
3. The callback checks the state JWT and the nonce cookie, then links immediately.

Session evidence on the callback request (discovery answer):

| Evidence | Sent on the Google → callback navigation? | Why |
|---|---|---|
| Refresh cookie | No | `SameSite=Strict`, and the navigation starts on `accounts.google.com`, so it is cross-site |
| Presence cookie | Yes | `SameSite=Lax`, `Path=/`, but it holds only `1` and is no credential |
| Bearer access token | No | It lives only in memory and is never attached to navigations |
| Nonce cookie | Yes | It can be planted by a sibling subdomain, which is the attack itself |

## Goals / Non-Goals

**Goals:** a link completes only for a request authenticated as `linkUserId`. A mismatch or a missing session links nothing and gets a generic error. Sign-in and registration are unchanged. No credential appears in any URL.

**Non-goals:**
- Hardening the sign-in nonce cookie against planting (login CSRF: a planted nonce plus the attacker's own captured callback URL signs the victim into the attacker's account). This is tracked separately as Odoo task #189.
- Changing the refresh cookie's `SameSite`.
- Adding a database table.

## Decisions

**D1 — Defer link creation to an authenticated request.** The callback leaves a signed pending-link result in the browser. The web app, which has a bearer token after normal session restore, then completes it with `POST /auth/google/link/complete`. The bearer token is the only session evidence that cannot be planted, and it fits the existing "callback hands off; app restores the session" pattern used for sign-in.

Alternatives rejected:
- (a) Relax the refresh cookie to `Lax` so it reaches the callback. This weakens the CSRF posture of every `/auth` route.
- (b) Use a `__Host-` binding cookie set at link start. Sibling subdomains cannot plant it, but it proves only "the browser that started the link", not a current session. It also needs `Secure` and `Path=/`, which breaks `http://` dev parity.
- (c) A same-site bounce page that re-requests with the Strict cookie. This is brittle across browsers, and it needs refresh-token validation without rotation.

**D2 — Pending-link token.** A JWT signed with `JWT_SECRET`:
- audience `google-link`, a dedicated audience so it cannot be confused with access tokens or Google state;
- `HS256`, expiry 5 minutes;
- payload `{linkUserId, providerAccountId, email}`.

It is stored in the cookie `flowledger_google_link_pending`: `HttpOnly; SameSite=Lax; Path=/auth/google/link; Max-Age=300; Secure` (on HTTPS deployments, via `secureAttribute()`).

`Lax`, not `Strict`, on purpose. The existing nonce cookie already uses `Lax` on the same callback response, which proves that every supported browser, Safari included, stores it there. The cookie's only reader is a POST that requires a bearer token, so `Strict` would add no protection. The browser sends the cookie on the web app's same-site, credentialed `fetch`, which `apiRequest` already does with `credentials: "include"`; `Lax` cookies are sent on same-site requests of any method.

The sign/verify helpers go in the existing `utils/googleState.ts`, next to `signGoogleState`. The cookie builder goes in the existing `utils/googleStateCookie.ts`, next to `googleStateCookie`. No new util file.

A planted pending cookie is harmless. An attacker can only mint tokens for their own Google identity. A token that names the victim's Google identity exists only in the victim's browser, and completes only with the victim's own bearer token, which mismatches `linkUserId`. The Google code exchange stays in the callback, so the authorization code is consumed immediately and never stored.

**D3 — Completion endpoint.** `POST /auth/google/link/complete` runs `requireAuth`, then the service `completeGoogleLink(userId, cookieHeader)`:
- no cookie, a bad signature, expiry, or the wrong audience → `HttpError(400, "Google could not be connected")`;
- `payload.linkUserId !== userId` → the same 400, plus a `console.warn` with no identifiers;
- otherwise the existing `linkGoogleIdentity(userId, profile)` → `{ result: "connected" | "conflict" }`.

The route is `requireWebOrigin, requireAuth, asyncHandler(googleLinkComplete)`. `requireWebOrigin` is mounted per route in `auth.routes.ts` and does **not** cover `googleRouter`, so it must be added explicitly. CSRF is already blocked by the bearer requirement, because a cross-site form cannot attach an `Authorization` header. The Origin check keeps this route consistent with the other session-changing `/auth` POSTs.

The controller sets the expiring pending cookie header **before** awaiting the service. The error middleware then still sends it on a 400, so the cookie is single-use from the browser's side on both success and error.

Replay: a captured pending token can at most repeat the same link for the same user within 5 minutes. `linkGoogleIdentity` is idempotent ("same identity, same user → connected"), so no server-side `jti` store is needed. The response is a small JSON object typed inline at the client (`apiRequest<{ result: "connected" | "conflict" }>`), like the existing `/auth/google/link` calls. It is output, not input, so it gets no shared schema.

**D4 — Callback link branch.**
- `error` or no `code` → `googleLink=failed`, and no pending cookie.
- Exchange or verification throws → `failed`.
- Success → set the pending cookie, clear the nonce cookie, and redirect with `googleLink=pending`.

`GoogleLinkResult` gains `"pending"` for the redirect value only. The completion endpoint never returns it.

**D5 — Web.** `GoogleSection` reads `googleLink` once, as it does now. When the value is `pending`, it fires a `useMutation(completeGoogleLink)` exactly once, guarded by a ref against StrictMode double effects, and shows "Connecting Google…". A 400 or a network error maps to the `failed` message. On settle it invalidates `["google-link"]`. The Profile route already requires an authenticated session, so the call runs after session restore.

`completeGoogleLink()` goes through `apiRequest`. That retries a 401 once after a silent refresh, but only for `/auth/*` paths listed in `ACCESS_TOKEN_AUTH_PATHS` (`apps/web/src/services/api.client.ts`). Today that set lists `/auth/google/link` by exact path, not `/auth/google/link/complete`. The new path **must be added**. Otherwise an expired access token on return from Google gives "failed" for a valid session, with no retry. The retry is safe: `requireAuth` rejects the first attempt before the controller runs, so the pending cookie is not cleared yet and the retried request still carries it.

## Risks / Trade-offs

- **Installed Home Screen app (iOS standalone PWA).** No regression versus today. `POST /auth/google/link` sets the nonce cookie in the jar of the context that started the link, and the callback needs that cookie.
  - If iOS finishes the OAuth round trip in a separate cookie jar, the nonce check fails today and still fails after this change. The user goes to `/login?oauthError=Invalid OAuth state`, which is the unchanged generic catch.
  - If the round trip stays in the app's jar, the pending cookie, the refresh cookie, and Profile are all in that same jar, so completion works.
  - Staging must exercise both iOS Safari and the installed app, and record which case applies.
- **Mobile Safari and Chrome (in a browser tab).** The start, the callback, and Profile share one jar. Session restore on `/profile` is a same-site `fetch` to `/auth/refresh`, so the `Strict` refresh cookie is sent, as it already is for today's `googleLink=connected` return.
- **An extra round trip and UI state.** Small.
- **A planted pending cookie (DoS only).** A sibling subdomain can overwrite a legitimate pending cookie with one for its own account. Completion then fails generically and the user retries. No link is made to the wrong account.
- **The email in an unencrypted signed cookie.** `HttpOnly`, path-scoped, and 5 minutes. It is the user's own Google email in their own browser.
