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
- Hardening the sign-in nonce cookie against planting (login CSRF). That is a separate concern; record it as its own Odoo task if it is not already tracked.
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

It is stored in the cookie `flowledger_google_link_pending`: `HttpOnly; SameSite=Strict; Path=/auth/google/link; Max-Age=300; Secure` (on HTTPS deployments, via `secureAttribute()`). The browser stores it from the callback response even though that navigation is cross-site. The browser sends it on the web app's same-site, credentialed `fetch`, which `apiRequest` already does with `credentials: "include"`.

A planted pending cookie is harmless. An attacker can only mint tokens for their own Google identity. A token that names the victim's Google identity exists only in the victim's browser, and completes only with the victim's own bearer token, which mismatches `linkUserId`. The Google code exchange stays in the callback, so the authorization code is consumed immediately and never stored.

**D3 — Completion endpoint.** `POST /auth/google/link/complete` runs `requireAuth`, then the service `completeGoogleLink(userId, cookieHeader)`:
- no cookie, a bad signature, expiry, or the wrong audience → `HttpError(400, "Google could not be connected")`;
- `payload.linkUserId !== userId` → the same 400, plus a `console.warn` with no identifiers;
- otherwise the existing `linkGoogleIdentity(userId, profile)` → `{ result: "connected" | "conflict" }`.

The controller always appends an expiring pending cookie, on success and on error, so the cookie is single-use from the browser's side. The existing Origin-check middleware already covers this POST.

**D4 — Callback link branch.**
- `error` or no `code` → `googleLink=failed`, and no pending cookie.
- Exchange or verification throws → `failed`.
- Success → set the pending cookie, clear the nonce cookie, and redirect with `googleLink=pending`.

`GoogleLinkResult` gains `"pending"` for the redirect value only. The completion endpoint never returns it.

**D5 — Web.** `GoogleSection` reads `googleLink` once, as it does now. When the value is `pending`, it fires a `useMutation(completeGoogleLink)` exactly once, guarded by a ref against StrictMode double effects, and shows "Connecting Google…". A 400 or a network error maps to the `failed` message. On settle it invalidates `["google-link"]`. The Profile route already requires an authenticated session, so the call runs after session restore.

## Risks / Trade-offs

- **Installed Home Screen app on iOS.** The callback may open in Safari, which has no session there, and the link then fails safely. The pending cookie expires in 5 minutes. This is acceptable. Verify the behavior on staging and document it.
- **Safari/ITP and storing a Strict cookie from a cross-site navigation response.** Expected to work, because it is a first-party response. If staging shows otherwise, fall back to `SameSite=Lax`: the cookie is still path-scoped, and its consumer is a POST that requires a bearer token.
- **An extra round trip and UI state.** Small.
- **The email in an unencrypted signed cookie.** `HttpOnly`, path-scoped, and 5 minutes. It is the user's own Google email in their own browser.
