# Tasks

Prerequisites: `st005-reusable-editable-form-view` and `st007-transaction-form-view` implemented. Tests go in the sibling `tests/` folder per `docs/TESTING.md`. Route, integration and e2e tests need Docker (see `CLAUDE.local.md`: start the VM, export `DOCKER_HOST` and `TESTCONTAINERS_HOST_OVERRIDE`). New exports get TSDoc.

## 1. Migration and shared schemas

- [x] 1.1 Edit `database/prisma/schema.prisma`: `User.username` (nullable then unique), `IdentityVisibility`, `UserBlock`, `ShareAcceptance` + `SharedExpenseParticipant.acceptance` (default `proposed`), new `NotificationType` values. Verify: `npm run prisma:generate` and `npm run typecheck` pass.
- [x] 1.2 Create the single B-004 migration via Prisma, hand-adding the data backfill (username `user_`+12 random chars `WHERE username IS NULL`, then NOT NULL + unique; app-user acceptance `accepted`). GATE: the owner approves the migration SQL, including the data backfill, before it is applied. Verify: owner approval recorded; applied to a scratch DB; re-running the assignment changes zero rows; no other raw SQL exists. Approval: owner authorized additive migrations on dev/staging (2026-11-10); SQL reviewed by the lead; production not authorized.
- [x] 1.3 Add shared Zod schemas and constants in `packages/shared/src/schemas/`: username (rules, reserved list), visibility, acceptance, block body, public user type (the `sharedExpense` update shape is ST-007's). Verify: `schemas/tests/` cover valid, invalid, normalization and reserved cases.

## 2. Identity and privacy

- [x] 2.1 Add `generateUsername` helper and call it in email signup (`auth/services/create.service.ts`) and `findOrCreateGoogleUser` (inside its transaction), retrying on P2002. Verify: `services/tests/` cover both paths and a collision retry.
- [x] 2.2 Add `toPublicUser`/`publicUserSelect` and apply to users search, group members and add-member response, debts, person balances, settlements, shared-expense owner/participants (live label for app users), new notification text. Verify: unit tests per util/service; an integration test (Docker) asserts no email/phone in any listed response.
- [x] 2.3 Rework `GET /users/search` (exact then prefix, min 3, max 10, no email/name, excludes self; per-user `createRateLimiter`) and add `GET /users/username-availability`. Verify: service tests plus `users.routes.test.ts` (Docker) incl. 429.
- [x] 2.4 Username and visibility change through the own-profile update with P2002 -> 409. Verify: update service tests, including a concurrent-claim case; rename keeps relations (integration, Docker).

## 3. Blocking

- [x] 3.1 Block services and `GET/POST /users/blocks`, `DELETE /users/blocks/:userId` (controllers via `asyncHandler`). Verify: service tests and routes test (Docker), including user isolation and idempotency.
- [x] 3.2 Effects: generic invite 400, notification suppression, search exclusion both ways, proposed -> rejected at block time. Verify: service tests; integration test that accepted shares and Group membership are untouched.

## 4. Consent

- [x] 4.1 Accept/reject service and `POST /shared-expenses/:id/accept|reject` scoped by `sharedExpenseId` + caller `userId`, only from `proposed`. Verify: service tests (not participant, owner, wrong state).
- [x] 4.2 Accepted-only counting helper applied to debts reads/totals, person balances and settlement requests; proposed listed as awaiting acceptance. Verify: `debts` service/util tests; integration test across modules (Docker).
- [x] 4.3 Material-change re-proposal, rejection stickiness, manual participants always accepted. Verify: tests for raise, lower, flip, title-only, rejected unchanged, rejected new amount.
- [x] 4.4 Notifications `shared_expense_invited/updated/accepted/rejected` with dedup. Verify: tests for dedup and blocked suppression.

## 5. Sharing edit and guards

- [x] 5.1 Implement `applySharedExpenseToTransaction(tx, ...)` (diff/upsert by id/userId, server-owned payment fields, universal participant rule in `normalizeSharedExpenseParticipants`, 409 on duplicate conversion). Verify: `shared-expenses/services/tests/` cover create, diff, add/remove, ignored client `paidAmount`, 409.
- [x] 5.2 Wire it into `transactions/update.service.ts` (inside the existing `$transaction`), re-point `PUT /shared-expenses/:id`, and add guards to `DELETE /shared-expenses/:id` and `DELETE /transactions/:id` (all the design's guards, 400 field messages). Verify: tests for each guard on each entry point; payment state preserved after legacy PUT.
- [x] 5.3 Non-member participant visibility: summary only, no Group data. Verify: integration test (Docker) asserts group routes 404 and no group fields.

## 6. Web UI

- [ ] 6.1 Extend ST-007's Sharing tab for existing transactions (convert, edit, disable, acceptance/paid columns and locks, username invitation search, totals, equal split) with `RelatedList`/`EditableField`; atomic save keeps the draft on failure. Verify: `TransactionDetailPage.test.tsx` additions for convert, edit, disable blocked, 400/409 keep draft, at 375px and desktop.
- [ ] 6.2 Debts "awaiting acceptance" list and notification target with Accept, Reject, "Reject and block". Verify: component tests incl. mobile and not-found.
- [ ] 6.3 Profile: username and visibility fields with debounced availability, and "Blocked users" tab (`RelatedList`, immediate mode). Remove email rendering and switch debts search to username. Verify: Profile tests; grep finds no email rendering of other users.

## 7. /v1 and MCP parity

- [x] 7.1 `/v1` routes: accept, reject, blocks, search/members/shared-expense/debts public shape, own profile fields; `PUT`/`DELETE /v1/shared-expenses/:id` stay unrouted. Verify: `v1` route tests (Docker) incl. read-key 403 and audit.
- [x] 7.2 MCP tools: accept/reject/block/unblock/list_blocked_users, universal sharing, `search_users`, `add_group_member`, `list_debts`, `get_profile`. Verify: MCP controller tests and REST parity tests (Docker).

Verification note for 7.1–7.2: implementation and unit checks complete (127 tests across 13 files). Docker integration validation was attempted with the required host variables; container setup failed because `192.168.56.20:2375` was unreachable. Integration validation remains pending; no existing database was migrated.

## 8. Docs

- [x] 8.1 Update `docs/DOMAIN_LOGIC.md` (four concepts, consent, counting, guards, blocking, universal sharing) and `docs/PUBLIC_API.md` (new routes, public shape, search). Verify: diff review.
- [x] 8.2 In `docs/KNOWN_ISSUES.md`, confirm the planning-time #037 update (email exposure fixed; Group add stays immediate) is still accurate; do not touch #019 (already reclassified). Verify: diff touches only #037, if at all.

## 9. Final verification

- [ ] 9.1 `npm run typecheck`, `npm run lint`, `npm run test` pass. Verify: exit 0.
- [ ] 9.2 Integration and e2e suites with Docker pass, including user isolation. Verify: exit 0.
- [ ] 9.3 Headless check at 375px and desktop of convert, accept, Blocked users and username change. Verify: no horizontal scroll; flows complete.
- [ ] 9.4 `openspec validate st003-convert-transaction-to-shared --strict` passes.
