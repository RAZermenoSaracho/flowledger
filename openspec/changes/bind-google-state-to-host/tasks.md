## 1. API

- [ ] 1.1 In `auth/providers/google/utils/googleStateCookie.ts`, replace the `googleStateCookieName` constant with `googleStateCookieName()`, which reads env at call time via `secureAttribute()`: `__Host-flowledger_google_oauth_state` when secure, otherwise the current name. `googleStateCookie()` uses it with `Secure; Path=/` when secure, or `Path=/auth/google/callback` otherwise, and never emits `Domain`. Leave the #163 link-pending cookie untouched. Verify `utils/tests/googleStateCookie.test.ts` with mocked env, no module reloads:
  - secure mode: prefixed name, `Secure`, `Path=/`, no `Domain`, `HttpOnly`, `SameSite=Lax`;
  - HTTP mode: legacy name and path, no `Secure`;
  - the clear cookie (`Max-Age=0`) carries the same name and attributes in both modes.
- [ ] 1.2 Update the call sites in `services/create.service.ts` (`handleGoogleCallback` reads the nonce via `googleStateCookieName()`) and `controllers/create.controller.ts` (uses the cookie helpers only). Verify `services/tests/create.service.test.ts`:
  - **a cookie header holding only the legacy unprefixed name, in secure mode, is rejected and creates no user, session, or pending link**;
  - the prefixed cookie with a matching nonce succeeds;
  - the existing sign-in and registration tests pass unchanged.

## 2. Docs

- [ ] 2.1 Update `docs/AUTH_FLOW.md`: the cookie name, `Path=/`, the HTTP-dev exception, and that a sibling subdomain cannot plant the nonce.

## 3. Verification

- [ ] 3.1 `npm run typecheck`, `npm run lint`, `npm run test`, and `npx openspec validate bind-google-state-to-host --strict`.

## Staging acceptance criteria (flowledger-dev.razs.dev)

- [ ] A: in DevTools, set `flowledger_google_oauth_state=<nonce>` with `Domain=razs.dev; Path=/auth/google/callback` in a second browser, then open a captured callback URL there: login page with an error, no session cookie, no new user. Also try setting `__Host-flowledger_google_oauth_state` with `Domain=razs.dev`: the browser refuses to store it.
- [ ] B: the real flow shows `__Host-flowledger_google_oauth_state` (Secure, Path=/, no Domain, HttpOnly) after the start redirect, and it is gone after the callback.
- [ ] C: Google sign-in works on desktop Chrome, mobile Safari, and `http://localhost`.
- [ ] D: Google link from Profile still connects and conflicts as before.

## Owner decisions

- Accept that HTTP development has no planting protection (no sibling domains exist there)? Proposed: yes.
- Accept one failed sign-in for users mid-flow at deploy time? Proposed: yes.
