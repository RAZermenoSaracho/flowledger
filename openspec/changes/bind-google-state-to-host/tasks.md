## 1. API

- [ ] 1.1 In `auth/providers/google/utils/googleStateCookie.ts`, derive `googleStateCookieName` from `secureAttribute()`: `__Host-flowledger_google_oauth_state` with `Secure; Path=/` when secure, otherwise the current name with `Path=/auth/google/callback`. Never emit `Domain`. Verify `utils/tests/googleStateCookie.test.ts` (reload the module with mocked env for each mode):
  - secure mode: prefixed name, `Secure`, `Path=/`, no `Domain`, `HttpOnly`, `SameSite=Lax`;
  - HTTP mode: legacy name and path, no `Secure`;
  - the clear cookie (`Max-Age=0`) carries the same name and attributes in both modes.
- [ ] 1.2 Make sure `handleGoogleCallback` reads the nonce only through `googleStateCookieName` and compares it with the state nonce. Verify `services/tests/create.service.test.ts`:
  - **a cookie header holding only the legacy unprefixed name, in secure mode, is rejected and creates no user, session, or pending link**;
  - the prefixed cookie with a matching nonce succeeds in sign-in and link modes;
  - a mismatched nonce is rejected;
  - the existing sign-in and registration tests pass unchanged.
- [ ] 1.3 Confirm the controller sets and clears the cookie only through the helpers. Verify `controllers/tests/create.controller.test.ts` for the cookie names on start, success, and failure. Add a route test in `auth/tests/auth.routes.test.ts` that replays a callback with a planted legacy cookie and asserts the login redirect with an error and no session `Set-Cookie`.

## 2. Docs

- [ ] 2.1 Update `docs/AUTH_FLOW.md`: the cookie name, `Path=/`, the HTTP-dev exception, and that a sibling subdomain cannot plant the nonce.

## 3. Verification

- [ ] 3.1 `npm run typecheck`, `npm run lint`, `npm run test`, and `npx openspec validate bind-google-state-to-host --strict`.

## Staging acceptance criteria (flowledger-dev.razs.dev)

- [ ] A: in DevTools, set `flowledger_google_oauth_state=<nonce>` with `Domain=razs.dev; Path=/auth/google/callback` in a second browser, then open a captured callback URL there: login page with an error, no session cookie, no new user.
- [ ] B: the real flow shows `__Host-flowledger_google_oauth_state` (Secure, Path=/, no Domain, HttpOnly) after the start redirect, and it is gone after the callback.
- [ ] C: Google sign-in and registration work on desktop Chrome and Safari, mobile Safari, mobile Chrome, and the installed Home Screen app, with and without "keep me logged in".
- [ ] D: Google link from Profile still connects and conflicts as before.
- [ ] E: local `http://localhost:5173` sign-in works.

## Owner decisions

- Accept that HTTP development has no planting protection (no sibling domains exist there)? Proposed: yes.
- Accept one failed sign-in for users mid-flow at deploy time? Proposed: yes.
- Should `REFRESH_TOKEN_COOKIE_DOMAIN`'s parent-domain presence cookie be reviewed separately? It holds no credential, so it is out of scope here. Proposed: no new task unless the owner wants one.
