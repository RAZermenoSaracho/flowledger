# Tasks

Every changed file under `controllers/`, `services/`, `utils/`, `hooks/`, or `components/` gets its matching test. Read `docs/TESTING.md` first.

## 1. API

- [ ] 1.1 Add `utils/googleLinkPending.ts` in `auth/providers/google/`. It provides `signGoogleLinkPending` and `verifyGoogleLinkPending` (audience `google-link`, `HS256`, 5 minutes), plus `googleLinkPendingCookie(value, maxAge)` (`HttpOnly; SameSite=Strict; Path=/auth/google/link; Secure` on HTTPS). Add the payload type to `types/google.types.ts`. Verify `utils/tests/googleLinkPending.test.ts` covers a round trip, the wrong audience, expiry, a malformed payload, and the cookie attributes.
- [ ] 1.2 In `services/create.service.ts`, change the link branch of `handleGoogleCallback` to return `{ linkResult: "failed" }` or `{ linkResult: "pending", pendingToken }` without creating a link. Add `completeGoogleLink(userId, cookieHeader)` per D3. Verify `services/tests/create.service.test.ts`:
  - the callback creates no `userAuthAccount`;
  - matching user → connected, and conflict cases preserved;
  - **mismatched user → 400 and no create**;
  - missing, expired, or forged cookie → 400;
  - the existing sign-in tests still pass unchanged.
- [ ] 1.3 In `controllers/create.controller.ts`, make the callback set the pending cookie on `pending`, and add a `googleLinkComplete` handler that always expires the pending cookie. Register `POST /link/complete` with `requireAuth` in `google.routes.ts`. Verify controller tests cover: the pending redirect URL and cookies, no session cookies in link mode, a 401 without a bearer token, and a cleared cookie on both success and error.
- [ ] 1.4 Add the completion response schema/type (`{ result: "connected" | "conflict" }`) to `packages/shared/src/schemas/auth.ts`, with a test.

## 2. Web

- [ ] 2.1 Add `completeGoogleLink()` (`POST /auth/google/link/complete`) to `services/auth.client.ts`. Verify `auth.client.test.ts`.
- [ ] 2.2 In `GoogleSection.tsx`, handle `googleLink=pending` per D5. Verify `GoogleSection.test.tsx` with msw covers: pending → connected, pending → conflict, pending → 400 shows failed, the call happens once, and the param is removed from the URL.

## 3. Docs and verification

- [ ] 3.1 Update the Google link section and the security notes in `docs/AUTH_FLOW.md`.
- [ ] 3.2 Run `npm run typecheck`, `npm run lint`, and `npm run test`.
- [ ] 3.3 Staging:
  - link on desktop Chrome/Safari and mobile Safari/Chrome;
  - replay a captured callback in a signed-out browser → no link;
  - complete with a second user's session → rejected, no link;
  - Google sign-in and registration still work in both session modes.
