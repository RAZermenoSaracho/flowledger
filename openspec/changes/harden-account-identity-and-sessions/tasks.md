# Tasks

Work on a feature branch from the latest `razs_ai`, after `fix-access-token-purpose-validation` is deployed. Every changed file under `controllers/`, `services/`, `utils/`, `hooks/`, or `components/` gets its matching test. Read `docs/TESTING.md` first.

## 1. Google linking

- [ ] 1.1 In `google/services/create.service.ts`, remove the find-by-email linking branch and refuse on a case-insensitive email match. Verify `services/tests/create.service.test.ts` covers existing link, new user, and refusal with no link or token created.
- [ ] 1.2 Add `linkUserId` to the Google state, and a `POST /auth/google/link` route behind `requireAuth` that returns the Google URL and sets the nonce cookie. Verify controller and `googleState` tests cover an unauthenticated 401 and a signed claim.
- [ ] 1.3 In the callback, handle link mode: create only the link, issue no session, refuse an identity linked elsewhere, and redirect to Profile with a generic result. Verify a test asserts no `Set-Cookie` session and no other-account detail.
- [ ] 1.4 Show the refusal on the login page, and add a Connect Google control to the Profile security tab. Verify component tests render the message through the existing `oauthError` path and show the connected state.

## 2. Email change

- [ ] 2.1 Add a shared schema with new email and current password in `packages/shared/src/schemas/auth.ts`, plus tests. Verify invalid and missing fields are rejected.
- [ ] 2.2 Add `PATCH /auth/email` and a service with one transaction for the update and the revocation, reusing `updatePassword`'s keep-this-device logic. Verify service tests: correct password, wrong password, 409, password-less account, and other sessions revoked with this device kept.
- [ ] 2.3 Make `updateProfile` reject a differing email, and confirm `/v1` and MCP remain unable to change email. Verify service and integration tests.
- [ ] 2.4 Update `apps/web/src/pages/Profile/` so a changed email asks for the current password and calls the new client function, keeping the inline edit pattern. Verify hook and component tests with `msw`.

## 3. Abuse resistance

- [ ] 3.1 Extend `createRateLimiter` with an optional key generator and a JSON message, and apply the D4 limits to the auth routes. Verify `utils/tests/rateLimit.test.ts` and route tests: 11th failed login is 429, another IP still succeeds, and a successful login isn't counted toward the failure limit.
- [ ] 3.2 Run a bcrypt comparison against a fixed dummy hash when the user or password hash is missing in `authenticateUser`. Verify a service test asserts one compare call in all three branches and the same 401.
- [ ] 3.3 Add the `Origin` check middleware from D7. Verify middleware tests: foreign origin 403 with no state change, configured origin passes, absent origin passes.

## 4. Session lifecycle

- [ ] 4.1 Implement the D5 replay walk in the refresh path. Verify service tests: grace period respected, descendants revoked after it, including siblings from concurrent refreshes, other device unaffected, and all existing session-persistence scenarios still pass.
- [ ] 4.2 Delete the user's expired refresh rows on issue, without failing the request if that delete fails. Verify tests: expired rows gone, revoked unexpired rows kept, and a delete failure still returns the token.
- [ ] 4.3 Make the refresh cookie host-only and add the expired domain-scoped copy per D6. Verify `refreshTokenCookie.test.ts`: attributes for persistent and session modes, clear behavior, and presence cookie unchanged.
- [ ] 4.4 Fix `useAuth` logout and its callers so a failure shows an error and keeps the session, per the spec. Verify `useAuth.test.tsx` and a component test for both failure and retry.

## 5. Integration

- [ ] 5.1 Add or extend the auth integration test for link, refusal, email change, and replay, using synthetic users only. Verify it passes with the Docker test VM.
- [ ] 5.2 Run `npm run typecheck`, `npm run lint`, and `npm run test`. Verify all pass.

## 6. Documentation

- [ ] 6.1 Update `docs/AUTH_FLOW.md`, and flip `docs/KNOWN_ISSUES.md` #007, #029, and #031 to `[RESOLVED]`. Verify a search finds no remaining description of link-by-email or the old cookie domain.

## 7. Verification (owner)

- [ ] 7.1 Run a read-only count on production of accounts with both a password and a Google link, and decide whether any need review. Record only the count in the repository.
- [ ] 7.2 Before deploying, check real sign-in on a throwaway dev account: Google refusal, Connect Google, and email change. Verify on `flowledger-dev.razs.dev`.
- [ ] 7.3 After deploying, confirm sessions persist on desktop Chrome and Safari, mobile Safari and Chrome, and an installed Home Screen app, including a reopen after closing. Verify there is no login prompt and only one refresh cookie in browser tools.
