## 1. Shared

- [ ] 1.1 Remove `updateUserPlanSchema` and `UpdateUserPlanInput` from `packages/shared/src/schemas/auth.ts`; drop their cases in `schemas/tests/auth.test.ts` (keep the `planType`-stripping preferences case).

## 2. API

- [ ] 2.1 Remove the `/me/plan` route and its imports from `users/users.routes.ts`.
- [ ] 2.2 Remove `patchPlan` (`controllers/update.controller.ts`) and `updatePlan` (`services/update.service.ts`) and their unit tests (`controllers/tests/update.controller.test.ts`, `services/tests/update.service.test.ts`).
- [ ] 2.3 Add a route-level test in `users/tests/users.routes.test.ts` (create if absent, supertest + testcontainers): authenticated `PATCH /users/me/plan` returns 404 and the DB `planType` is unchanged. Keep the existing `planType` mass-assignment tests in `tests/integration/personalReview.integration.test.ts` and `mcp/controllers/tests/tools.user.controller.test.ts`.

## 3. Web

- [ ] 3.1 Remove `updatePlan` from `services/users.client.ts`; delete `pages/Profile/hooks/usePlan.ts` and `hooks/tests/usePlan.test.tsx`.
- [ ] 3.2 Make `SubscriptionTab.tsx` read-only (plan label and description from `useProfileUser`, no `PlanOption`, no buttons); rewrite `components/tests/SubscriptionTab.test.tsx` for free and `flowledger_one` users asserting no Upgrade/Downgrade button and no plan request.

## 4. Verify

- [ ] 4.1 `npm run typecheck`, `npm run lint`, `npm run test`; run the api route test with the Docker VM per `CLAUDE.local.md`.
- [ ] 4.2 Staging acceptance: (a) `curl -X PATCH $API/users/me/plan` with a valid user token returns 404 and `GET /users/me` still shows the prior plan; (b) Profile, Subscription shows the current plan with no switch control; (c) `PATCH /users/me` with `planType` leaves the plan unchanged; (d) after an operator DB update of `planType`, the tab and profile header show the new plan.
