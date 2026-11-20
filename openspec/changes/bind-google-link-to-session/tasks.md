# Tasks

Every changed file under `controllers/`, `services/`, `utils/`, `hooks/`, or `components/` gets its matching test. Read `docs/TESTING.md` first.

## 1. API

- [ ] 1.1 In `auth/providers/google/utils/googleState.ts`, add `signGoogleLinkPending` and `verifyGoogleLinkPending` (audience `google-link`, `HS256`, 5 minutes; payload validated like `verifyGoogleState`). In `utils/googleStateCookie.ts`, add `googleLinkPendingCookieName` and `googleLinkPendingCookie(value, maxAge)` (`HttpOnly; SameSite=Lax; Path=/auth/google/link; Secure` on HTTPS). Add the payload type to `types/google.types.ts`. Verify by extending `utils/tests/googleState.test.ts` and `utils/tests/googleStateCookie.test.ts`:
  - a round trip;
  - wrong audience, expiry, and a malformed payload are rejected;
  - `verifyGoogleLinkPending` rejects an access token and a Google state token (the reverse direction is already covered by the "another audience" case in `utils/tests/tokens.test.ts`);
  - the cookie attributes are correct.
- [ ] 1.2 In `services/create.service.ts`, change the link branch of `handleGoogleCallback` to return `{ linkResult: "failed" }` or `{ linkResult: "pending", pendingToken }` without creating a link. Add `completeGoogleLink(userId, cookieHeader)` per D3. Verify `services/tests/create.service.test.ts`:
  - the link-mode callback creates no `userAuthAccount`;
  - **the mismatched user gets a 400 with no create**;
  - the matching user gets connected, and the conflict cases are preserved;
  - a missing, expired, or forged cookie gets a 400;
  - a repeated completion with the same token stays idempotent;
  - a sign-in-mode state never returns a pending token;
  - the existing sign-in and registration tests pass unchanged.
- [ ] 1.3 In `controllers/create.controller.ts`, make the callback set the pending cookie on `pending`. Add a `googleLinkComplete` handler that sets the expiring pending cookie before awaiting the service. Register `POST /link/complete` as `requireWebOrigin, requireAuth, asyncHandler(googleLinkComplete)` in `google.routes.ts`. Verify:
  - Controller tests: the pending redirect URL and its cookies; no session cookies in link mode.
  - Route tests in `auth/tests/auth.routes.test.ts`, which cover cookie clearing end to end through the real error handler: 401 without a bearer token (pending cookie **not** cleared); 403 for a foreign `Origin`; 400 on a mismatch and 200 on success, each with a `Set-Cookie` that expires the pending cookie.

## 2. Web

- [ ] 2.1 Add `completeGoogleLink()` (`POST /auth/google/link/complete`, response typed inline as `{ result: "connected" | "conflict" }`) to `services/auth.client.ts`. Add `/auth/google/link/complete` to `ACCESS_TOKEN_AUTH_PATHS` in `services/api.client.ts`. Verify `auth.client.test.ts`, and an `api.client.test.ts` case: a 401 on the completion path triggers one refresh and a successful retry.
- [ ] 2.2 In `GoogleSection.tsx`, handle `googleLink=pending` per D5. Verify `GoogleSection.test.tsx` with msw:
  - pending → connected;
  - pending → conflict;
  - pending → 400 shows failed;
  - pending → network error shows failed;
  - exactly one call under StrictMode;
  - the param is removed from the URL.

## 3. Docs and verification

- [ ] 3.1 Update the Google link section and the security notes in `docs/AUTH_FLOW.md`.
- [ ] 3.2 Run `npm run typecheck`, `npm run lint`, and `npm run test`.
- [ ] 3.3 Staging:
  - link on desktop Chrome and Safari, mobile Safari and Chrome, and the installed iOS Home Screen app (record whether the app's cookie jar is shared, per the design's PWA risk);
  - replay a captured callback in a signed-out browser → no link;
  - complete with a second user's session → rejected, no link;
  - Google sign-in and registration still work in both session modes.
