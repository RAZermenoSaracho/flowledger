## 0. Dependencies

- [x] 0.1 `expand-personal-api-crud` implemented (provides `capList`, audit id capture, the 24-route base, MCP per-resource registration).
- [x] 0.2 Confirm the response key of each controller used for audit id capture (`group`, `sharedExpense`, `settlementRequest`) and extend `v1Audit.ts` + test.

## 1. Shared schemas

- [x] 1.1 `packages/shared/src/schemas/mcp.ts` + test: `updateGroupToolSchema` (from the base group object, plus `id`; `updateGroupSchema` has a `.refine`), `setArchivedToolSchema` reuse, `removeGroupMemberToolSchema` (`groupId`, `userId` optional meaning self), `requestSettlementToolSchema` (`debtId` plus `settlementRequestSchema`), Unknown keys rejected.

## 2. REST adapters

- [x] 2.1 `v1/controllers`: shared-expense list handler using `capList`; create-shared-expense handler that loads the owned transaction, requires `groupId` (400) and then calls the existing service. Tests with mocked services.
- [x] 2.2 `v1.routes.ts`: 4 read routes (`requireScope("read")`, existing validators).
- [x] 2.3 `v1.routes.ts`: group writes (create, update, archive, restore), `DELETE /groups/:id/members/:userId`, `POST /shared-expenses`, `POST /debts/:id/settlement-request`, `POST /settlements/:id/approve|reject`; each with `auditV1Write`, `requireScope("write")`, `validate(sharedSchema)` where there is a body. Update the router comment (37 routes).
- [x] 2.4 404 tests for each excluded route (group delete, member add, shared-expense put/delete, settle, batch).

## 3. MCP adapters

- [x] 3.1 New `mcp/controllers/groupTools.controller.ts`, registered from `registerTools`: 2 read tools (`id` optional selects detail) and, in the `write` branch via `runWrite`, 6 write tools. Descriptions say which tools notify or affect other users; `remove_group_member` has `destructiveHint: true`; archive tool `idempotentHint: true`. Shared-expense creation applies the same group-transaction precondition as 2.1 through one shared helper.
- [x] 3.2 Unit test (mock services): tool counts for read and write credentials, acting id only from `auth`, scope refusal, one audit per call, unknown keys stripped, group-transaction precondition.

## 4. Test matrix (testcontainers)

- [x] 4.1 `src/tests/integration/v1.groups.integration.test.ts` (supertest, users A admin, B member, C stranger): every route success; 401; 403 read key on writes; 404 for C; 404 for B on admin-only routes; self-leave; admin remove; B removes A (404); shared-expense creation cases (non-group transaction 400, non-member participant 400, foreign transaction 404, valid 201 plus notification); settlement flow (debtor request 201, creditor request 404, duplicate 400, creditor approve creates two transactions and updates paid state, debtor approve 404, reject, decided 404); excluded routes 404; cap with 250 shared expenses; audit lines.
- [x] 4.2 `src/tests/integration/mcp.groups.integration.test.ts` (SDK client): tool lists, read key cannot call write tools, authz cases mirrored from 4.1, no approve/reject tool listed, descriptions mention other users.
- [x] 4.3 Parity: REST and MCP return equal data for each read, produce the same DB state for each shared write, and refuse the same foreign/non-member cases.

## 5. Docs and close out

- [x] 5.1 Add `docs/KNOWN_ISSUES.md` entries: shared-expense update participant replacement (`update.service.ts:60-66`); no last-admin guard in `removeGroupMember`; `deleteSharedExpense` leaves notifications; transaction amount change does not rescale participant shares; group hard delete orphans transaction group ids; shared expenses outside groups allow any user id as participant (web path unchanged).
- [x] 5.2 `npm run typecheck`, `npm run lint`, `npm run test` pass; Docker integration suite passes.

## 6. Parity pass: user search, member add, group category create

- [x] 6.1 `packages/shared/src/schemas/mcpGroups.ts` + test: `apiUserSearchQuerySchema` (q min 3, limit max 10), `searchUsersToolSchema`, `addGroupMemberToolSchema`, `createGroupCategoryToolSchema`.
- [x] 6.2 `v1.groups.routes.ts`: `GET /users/search`, `POST /groups/:id/members`, `POST /groups/:id/categories` reusing `getUserSearch`, `postGroupMember`, `postGroupCategory`; `auditV1Write` on the writes.
- [x] 6.3 `tools.groups.controller.ts`: `search_users` (read), `add_group_member`, `create_group_category` (write via `runWrite`); unit tests.
- [x] 6.4 Docker integration (REST and MCP): admin success, non-admin and stranger refusal, read key refused, short query 400, 10-row cap, REST/MCP parity.
- [x] 6.5 Held non-goals recorded in proposal: shared-expense update, group delete, MCP approve/reject, batch settlement, `settleDebtDirectly`.

## Acceptance criteria

- Exactly the listed routes and tools are added; excluded operations return 404 or are absent from MCP.
- No migration, scope, service or duplicated authorization; web app behaviour unchanged.
- Section 4 matrix passes including cross-user isolation, read-key refusal and group-admin rules.
