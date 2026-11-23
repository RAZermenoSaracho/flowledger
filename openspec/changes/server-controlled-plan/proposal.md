## Why

Odoo task #161 (KNOWN_ISSUES #036). `PATCH /users/me/plan` (`users.routes.ts` → `patchPlan` → `updatePlan` in `users/services/update.service.ts`) writes the client-supplied `planType`, validated by `updateUserPlanSchema` (`packages/shared/src/schemas/auth.ts`). Any signed-in user can therefore switch to `flowledger_one` with no payment or admin check. Nothing gates on `planType` today, so there is no current impact, but the first plan-gated feature would be bypassable.

Caller trace:

- Only `PATCH /users/me/plan` writes the column. `PATCH /users/me` (profile/preferences, including MCP `update_preferences`) already strips `planType`; integration and MCP tests prove it.
- `/v1` and MCP expose no plan write. The only web caller is `usersClient.updatePlan`, used by `usePlan` and `SubscriptionTab` (Upgrade/Downgrade buttons).
- Nothing grants plans: no billing integration, admin role, or seed path exists. `planType` defaults to `"free"` (`schema.prisma`).

## What Changes

- **BREAKING (API)**: remove `PATCH /users/me/plan`, `patchPlan`, `updatePlan`, and `updateUserPlanSchema`/`UpdateUserPlanInput`. The route then returns the standard 404 for every user. No trusted write path is built: with no billing or admin concept, one would be speculative. `planType` stays readable in `publicUser` and changes only by an operator update in the database until billing exists (see Owner decisions in `design.md`).
- Web: remove `updatePlan` from `users.client.ts` and delete `usePlan`. `SubscriptionTab` becomes read-only: it shows the current plan label and description with no Upgrade/Downgrade control and no error state. The `["me"]` user query supplies the plan.
- Tests: replace the self-service tests with rejection and read-only tests (see `tasks.md`).

## Capabilities

### New Capabilities

- `account-plan`: the plan tier is server-controlled and visible read-only.

### Modified Capabilities

None.

## Impact

- API: `users/users.routes.ts`, `controllers/update.controller.ts`, `services/update.service.ts` and their tests.
- Shared: `packages/shared/src/schemas/auth.ts` and `schemas/tests/auth.test.ts`.
- Web: `services/users.client.ts`, `pages/Profile/components/SubscriptionTab.tsx`, `hooks/usePlan.ts` (deleted) and their tests.
- Docs: none mention the endpoint; no change.
- Data: no migration, no backfill. Test users who already self-selected `flowledger_one` keep it; the pre-production policy makes a reset of that column unnecessary because nothing reads it. If the owner wants them back to `free`, that is a destructive data operation needing explicit approval of the exact statement (see Owner decisions).
- No new dependency or env var.
