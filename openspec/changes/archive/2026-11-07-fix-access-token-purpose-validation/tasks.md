# Tasks

Branch from the latest `origin/main`, not from a local `razs_ai` that holds the unpushed security planning commit. Keep the commit message neutral. Read `docs/TESTING.md` first. Depends on no other change.

## 1. Tests that fail first

- [x] 1.1 In `apps/api/src/middleware/tests/auth.test.ts`, add cases for a Google-state-shaped token, a consent-shaped token, a correctly signed token with no audience, a missing subject, an empty subject, a non-string subject, a missing email, and a wrong algorithm. Verify the new rejection cases fail on the unfixed code, and update the valid-token case to use `signAccessToken`.
- [x] 1.2 In `apps/api/src/modules/auth/tests/auth.routes.test.ts`, or a new `apps/api/src/middleware/tests/` route-level test using the existing supertest setup, assert that a state-shaped token gets 401 from `GET /notifications` and `GET /transactions`, with no records in the body. Verify it fails on the unfixed code, using only synthetic users.

## 2. Implementation

- [x] 2.1 In `apps/api/src/modules/auth/utils/tokens.ts`, add the audience constant, set it in `signAccessToken`, and add a documented `verifyAccessToken` that requires the audience, HS256, a non-empty string `sub`, and a string `email`. Verify with `apps/api/src/modules/auth/utils/tests/tokens.test.ts`.
- [x] 2.2 Make `requireAuth` delegate to `verifyAccessToken`, and move its payload type out of the middleware if one is still needed. Verify the tests from 1.1 and 1.2 pass.
- [x] 2.3 Add `algorithms: ["HS256"]` to `verifyGoogleState` and the consent-request verifier. Verify their tests cover a wrong algorithm and an access token being rejected.
- [x] 2.4 Update `docs/AUTH_FLOW.md` with token purposes and the verification rules. Verify a search finds no remaining claim that contradicts them.
- [x] 2.5 Run `npm run typecheck`, `npm run lint`, and `npm run test`, with the Docker test VM running for integration suites. Verify all pass.

## 3. Deployment verification (owner approves the deploy)

- [ ] 3.1 After deployment, sign in on one desktop browser and one phone with an existing session, and verify the session continues without a login prompt and the dashboard loads.
- [x] 3.2 Confirm the deployed `apps/api/dist` contains the new verifier by inspecting the build on the host, without sending other-purpose tokens to production. Verify the commit deployed by `.github/workflows/deploy-prod.yml` matches the fix.

## 4. Exposure review (read-only, owner runs or approves)

- [ ] 4.1 Review retained API access logs for requests to protected routes that returned 200 shortly after `GET /auth/google` from the same address, with no matching `/auth/google/callback`. Record the method, the retention period, and the result, and state plainly that the logs identify neither the token nor the user.
- [ ] 4.2 Decide with the owner whether the result calls for telling affected users. Record the decision outside the public repository if it contains personal data.

## Results

Deployed to production on 2026-11-07. A genuine state token from `GET /auth/google` got 401 on `/notifications`, `/transactions`, and `/accounts`. Open: the real-device session check (3.1) and the log review (4.1, 4.2). The change landed through the full initiative rather than a separate hotfix, at the owner's direction.
