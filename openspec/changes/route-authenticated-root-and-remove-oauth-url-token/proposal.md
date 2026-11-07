# Proposal

## Why

Signed-in users opening `https://flowledger.razs.dev/` see the public landing page, because the gateway looks for a cookie that browsers never send on `/`. Separately, Google sign-in places an access token in the callback URL even though the same response has already set everything the app needs to get one safely.

## Findings

Evidence is from production `main` at `9d57822` and `flowledger_landing` at `efdfc72`. `razs_ai` has an identical application tree; the landing repository exists only as a production checkout.

| ID | Severity | Confidence | Status | Trust boundary | Finding and evidence | Impact |
|---|---|---|---|---|---|---|
| F-15 | UX only | High | Confirmed; `docs/KNOWN_ISSUES.md` #032 | Browser to gateway | `flowledger_landing/server/gateway.js:7,28` reads `flowledger_refresh_token`, which has `Path=/auth`. `flowledger_session` exists for this purpose (`auth/utils/refreshTokenCookie.ts:11`). | Extra click for signed-in users |
| F-16 | Low to Medium | High | Confirmed | API to browser URL | `google/controllers/create.controller.ts:41-43` puts the token in the fragment. `OAuthCallbackPage.tsx` reads it, with no scrub on its error paths. | Token in the browser's URL and history; up to 15 minutes of API access if copied |
| F-17 | Low | High | Confirmed | Client state | Fragment flow races with `AuthProvider`'s boot refresh, and a failed `getMe` can clear the token that refresh stored (`OAuthCallbackPage.tsx:32`). | Spurious sign-in error |
| F-18 | Low | Medium | Plausible | Cache to browser | `/` has no `Cache-Control` or `Vary: Cookie`, and the zone has a 4-hour browser cache TTL, so a cached response may show the wrong page. | Wrong page after sign-in or sign-out |
| F-19 | UX only | High | Confirmed | Client state | A rejected refresh doesn't clear the presence cookie, so a revoked session keeps routing `/` to the app until it expires. | Login page instead of the landing page |

## What Changes

- The gateway routes `/` on the presence cookie, with no token parsing or validation.
- `/` responses are marked private and uncacheable.
- A rejected refresh clears the presence cookie only.
- The Google callback redirects with no token. The callback page waits for `AuthProvider`'s session restore, then navigates once.
- The `redirect` value stays out of the visible URL once it has been read, on success and error paths.

## Scope and non-goals

Non-goals: JWT validation or API calls in the gateway, moving the app to `/app`, landing-page JavaScript session checks (cookies are `HttpOnly`), a one-time exchange-code endpoint, and changing `start_url`. The manifest's `/login` already sends signed-in users to the app without passing through `/` routing.

## Capabilities

### New Capabilities
- `authenticated-root-routing`: What `/` shows signed-in and signed-out visitors.
- `google-sign-in-callback`: How Google sign-in returns to the app without placing credentials in a URL.

### Modified Capabilities
- `session-persistence`: The presence cookie also clears on a rejected refresh.

## Impact

- **Landing repository:** `server/gateway.js`. There is no development checkout, so implementation starts from a fresh clone, never in `/Users/razs/production/flowledger_landing`.
- **API:** `apps/api/src/modules/auth/providers/google/controllers/create.controller.ts`, `apps/api/src/modules/auth/controllers/update.controller.ts`.
- **Web:** `apps/web/src/pages/OAuthCallback/OAuthCallbackPage.tsx`.
- **Docs:** `docs/AUTH_FLOW.md`, `docs/KNOWN_ISSUES.md`. **Dependencies, schema, environment:** none.
