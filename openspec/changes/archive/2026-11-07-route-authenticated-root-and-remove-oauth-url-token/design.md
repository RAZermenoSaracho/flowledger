# Design

## Context

See `proposal.md`. Topology read from the host: Cloudflare to `cloudflared`, then `flowledger.razs.dev` to the gateway on 5182, then landing on 5181 or app on 5173. `api-flowledger.razs.dev` goes directly to port 4000. The app's index route is the dashboard (`apps/web/src/main.tsx`), and `ProtectedRoute` renders nothing while a session is restoring. `AuthProvider` wraps every route and calls `/auth/refresh` on mount, including on the callback page. `flowledger_session` is `HttpOnly`, `SameSite=Lax`, `Path=/`, and shares `Domain=.razs.dev` so the gateway host receives it. There is no service worker. Both manifests start at `/login`, and `LoginPage` redirects signed-in users.

## Goals / Non-Goals

**Goals:** see `proposal.md`, with the smallest diff in each repository.

**Non-Goals:** see `proposal.md`.

## Security invariants

1. The gateway treats the presence cookie as a routing hint only and grants nothing because of it. The app still validates every session.
2. No credential appears in a URL during Google sign-in.
3. `/` is never stored by a shared cache.
4. A forged presence cookie only changes which public shell loads.

## Decisions

### D1. One-constant gateway change

Rename `REFRESH_TOKEN_COOKIE_NAME` and `hasRefreshTokenCookie` to the presence cookie's name. The existing exact `name=` match already refuses similar names. Add the two cache headers for `/`, on both the landing and app branches, using `proxyRes` or `res.setHeader` before proxying. Confirm that `http-proxy` doesn't overwrite them; if it does, set them in `proxyRes`.

### D2. Remove the token, keep the destination

The callback controller redirects with only `redirect`, and the page waits on `isInitializing`. On `user`, it navigates once with `replace`. With `isSessionUnavailable`, it shows the connection message. Otherwise it shows the error. The page removes the fragment with `history.replaceState` as soon as it has read the destination, so an error page has a clean URL.

*Alternative:* a one-time exchange code. It is the standard pattern when no cookie is available, but here the refresh cookie already exists, so it would add an endpoint and state for nothing.

The boot refresh is already running on this page today, so this change removes a race rather than adding a dependency. The effect needs a guard or narrower dependencies so that StrictMode and context changes can't navigate twice.

### D3. Clear only the presence cookie on rejection

Clearing the refresh cookie on a 401 could wipe a valid cookie just set by another tab's rotation. Presence alone is safe, because it holds no credential and the next successful refresh restores it. The worst case is a brief landing page for a user whose session is fine.

### D4. Keep `start_url` as `/login`

An installed app opened at `/` signed out would show a marketing page inside the app. `/login` already restores a session and redirects without a form, as `LoginPage.tsx:33-34` shows.

## Browser behavior

Static review only; real-device confirmation is required by task 5.

| Environment | Root routing | Google callback | Evidence state |
|---|---|---|---|
| Desktop Chrome, Safari, Firefox | Top-level navigation sends the `Lax` presence cookie | Page fetch to the API is same-site, so `Strict` sends | Expected, verify |
| Mobile Safari | Same; check persistence under Safari's tracking rules | Same; must pass after a cross-site return from Google | Plausible risk, verify |
| Mobile Chrome | Same | Same | Expected, verify |
| Installed iOS app | Starts at `/login`, so `/` routing isn't used | Highest risk: Google may open outside the app's cookie store, and today's fragment token can hide that | Unknown, must verify before merge |
| Installed Android app | Same | Custom tab shares cookies with Chrome in most cases | Expected, verify |

## Risks / Trade-offs

- [A Home Screen app keeps its cookies separate from the browser sheet used for Google] → Test before merging. If sign-in fails only there, show a clear next step and keep email sign-in working, or defer F-16 while shipping the rest. Do not ship a silent failure.
- [Cloudflare's 4-hour browser TTL overrides `no-store`] → Task 5 checks the response header. Add a Cloudflare cache rule for this host if it does.
- [The landing repo deploys on push to `main`] → Its `CLAUDE.md` requires owner approval before any push.

## Migration Plan

**Deployment order within this change:**

1. API and web: tokenless callback, presence clearing, through the normal `main` deploy.
2. Gateway, afterward. It needs only the presence cookie, which the API already sets.

**Across the initiative:** after `fix-access-token-purpose-validation`. Preferably after `harden-account-identity-and-sessions`, which edits the same controller.

**Compatibility:** sessions without a presence cookie see the landing page once. Old clients holding a loaded callback page finish with their existing token.

**Rollback:** each side reverts alone. Reverting the gateway restores the extra click only. API and web deploy together and revert together. A new page with an old API still works through the boot refresh, because it ignores the token. An old page with a new API fails, because it requires one.
