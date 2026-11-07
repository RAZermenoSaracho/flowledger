# Proposal

## Why

Roadmap batch B-002 holds two independent intents. **ST-004:** dark mode reads as dark blue because it is built on Tailwind's `slate` scale. **ST-002 (Odoo #128):** users are asked to log in despite a 30-day sliding refresh token. Discovery found no need to replace the token architecture: it reproduced several specific defects in how sessions are presented, recovered, and rotated, and sessions cannot currently be chosen per device or revoked on password change.

## What Changes

**ST-004: Neutral charcoal dark theme**

- Back the `slate` scale with CSS variables: original values at `:root`, a neutral charcoal scale under `.dark`. Every existing `dark:*-slate-*` class changes without component edits, and light mode resolves to the same colors.
- Replace the hardcoded dark values in `index.css`, and theme Recharts tooltips and axes centrally.

**ST-002: Keep me logged in on this device**

- Add a checked-by-default "Keep me logged in on this device" option to the login page, applying to email/password and Google sign-in. Checked: 30-day sliding session in a persistent cookie. Unchecked: 24-hour sliding session in a browser-session cookie.
- Fix verified causes of unwanted logouts:
  - A signed-in user opening `/` gets the landing page because the refresh cookie (`Path=/auth`) never reaches the gateway, and `/login` then asks for credentials even with a valid session. Add a non-secret presence cookie on `Path=/` and redirect signed-in users away from `/login`. The gateway needs a one-line change in the separate `flowledger_landing` repo.
  - A network error or 5xx during refresh signs the user out in the UI. Only a 401 from `/auth/refresh` will end a session.
  - A rotated token whose response was lost, and a concurrent refresh from another tab, get a 401. A token will stay usable until its successor is first used.
  - Dev and production share one cookie name and `Domain=.razs.dev`, so they overwrite each other's session in one browser. Non-production will use its own cookie names.
- Changing a password revokes every other session. **BREAKING (internal):** `PATCH /users/me/password` moves to `PATCH /auth/password`, because the refresh cookie is only sent under `/auth`. The web app is the only caller.
- Correct `CLAUDE.md`, `apps/web/CLAUDE.md`, and `docs/AUTH_FLOW.md`.

**Mobile and PWA icons (owner-approved addition to B-002)**

- iOS home-screen shortcuts show a generated "F" and mobile tabs are inconsistent, because only an SVG favicon exists. Add a raster favicon, an Apple touch icon, and a web app manifest, all derived from the in-app logo mark. No service worker.

**Mobile Reports filters (owner-approved addition to B-002)**

- B-001 made the Reports filters always visible at every width, which pushes results far down on a phone. Restore the earlier behavior below `lg`: collapsed by default, with a Filters button. Desktop stays always visible.

**Non-goals**

- Login rate limiting and refresh reuse detection (`docs/KNOWN_ISSUES.md` #007).
- Re-authentication for sensitive actions. Evaluated: password change already requires the current password, and the rest would be a new feature with no reported need.
- Revoking API keys or MCP OAuth grants on password change, a session-management UI, PWA packaging, a design system, or new colors for brand and chart series.

## Capabilities

### New Capabilities

- `dark-theme`: Neutral dark palette, contrast and surface distinctness, chart and native-control readability, and an unchanged light theme.
- `session-persistence`: Per-device session choice, lifetime, resilience to transient failures and lost refresh responses, revocation on logout and password change, and session detection from the landing gateway.

- `app-icons`: Brand icons in browser tabs, iOS home-screen shortcuts, and supported PWA installations.

### Modified Capabilities

- `transaction-datetime`: The Reports filter bar collapses behind a Filters button below `lg`. `select-dropdowns` is unchanged: it already treats native option popups as browser-rendered.

## Impact

- **Web:** `tailwind.config.ts`, `index.css`, a palette constant, `LoginPage`, `RegisterPage`, `GoogleOAuthButton`, `ProtectedRoute`, `useAuth`, `api.client.ts`, `auth.client.ts`, `users.client.ts`.
- **API:** `auth` module (cookie, tokens, services, controllers, routes, Google state), `users` module (password code moves out).
- **Shared:** `loginSchema`, `googleOAuthStartQuerySchema`.
- **Database:** one additive Prisma migration on `RefreshToken`: `persistent`, `previousTokenId`.
- **Static assets:** new icons and `manifest.webmanifest` in `apps/web/public`; `index.html` declarations.
- **Other repo:** one-line constant change in `flowledger_landing/server/gateway.js`, delivered separately after approval.
- **Dependencies and environment:** none new.
