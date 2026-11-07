# Tasks

Application work uses a feature branch from the latest `razs_ai`. Landing work uses a fresh clone at `/Users/razs/projects/flowledger_landing`; never edit `/Users/razs/production/flowledger_landing`. Pushing landing `main` deploys, so it needs the owner's explicit approval. Every changed app file under `controllers/`, `services/`, `utils/`, `hooks/`, or `components/` gets its matching test.

## 1. API

- [ ] 1.1 Remove `token` from the Google callback redirect in `google/controllers/create.controller.ts`, and update its TSDoc. Verify `controllers/tests/create.controller.test.ts` asserts no token in the `Location`, and session cookies present.
- [ ] 1.2 Expire only the presence cookie when `refresh` rejects, for both no-cookie and invalid-token cases. Verify `auth/controllers/tests/update.controller.test.ts` asserts the exact `Set-Cookie` and no refresh-cookie change.

## 2. Web

- [ ] 2.1 Rewrite `OAuthCallbackPage.tsx` to read and scrub `redirect`, wait for `isInitializing`, and handle user, unavailable, and rejected states, navigating once. Verify `tests/OAuthCallbackPage.test.tsx`: the three states, unsafe destinations, one navigation under StrictMode, and no fragment left after an error.
- [ ] 2.2 Update `apps/web/src/tests/e2e/authFlow.test.tsx` and `sessionExpiry.test.tsx` where they use the fragment. Verify with `npm run test -w apps/web`, and that a search finds no `#token` or `params.get("token")` in `apps/web/src`.

## 3. Gateway (landing repository)

- [ ] 3.1 Change the cookie constant and helper name in `server/gateway.js` to `flowledger_session`, and add `Cache-Control: private, no-store` and `Vary: Cookie` for `/`. Verify locally against stub upstreams with `curl`, using synthetic cookies: presence routes to app, no cookie routes to landing, `flowledger_session_x` routes to landing, and headers appear on both branches.
- [ ] 3.2 Confirm the landing page's URL stays `/`, and that `/landing-assets/` still loads, with a local preview. Verify in a browser with cache disabled.

## 4. Documentation

- [ ] 4.1 Update `docs/AUTH_FLOW.md`'s Google steps and presence-cookie section, and flip `docs/KNOWN_ISSUES.md` #032 to `[RESOLVED]`. Verify a search finds no description of a token in the callback URL.
- [ ] 4.2 Run `npm run typecheck`, `npm run lint`, and `npm run test` in `flowledger`, and the landing repository's lint and build. Verify all pass.

## 5. Real-device verification (owner)

- [ ] 5.1 On `flowledger-dev.razs.dev`, before merging, complete Google sign-in on an installed iOS Home Screen app, mobile Safari, and mobile Chrome. Verify each reaches the dashboard, or that the agreed clear next step appears, and record the result in this change. Stop and redecide per the design risk if the installed app fails.
- [ ] 5.2 After deploying API and web, then the gateway, open `https://flowledger.razs.dev/` signed in and signed out on desktop Chrome and Safari, mobile Safari and Chrome, and an installed app. Verify the correct page, no redirect loop, no login-form flash, and the expected cache headers in browser tools.
- [ ] 5.3 Revoke one test session from another device, then open `/` on the revoked device twice. Verify one redirect to login and then the landing page.
