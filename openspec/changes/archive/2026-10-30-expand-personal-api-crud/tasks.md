## 0. Prerequisites

- [x] 0.1 Ensure `createAccount`/`updateAccount`/`createTransaction`/`updateTransaction` take shared-schema types instead of `body: any`. If `fix-repository-lint-errors` task 2.2 already did this, verify and tick; otherwise make that edit here (same change, done once).
- [x] 0.2 Confirm `add-personal-api-keys` and `add-mcp-server` are implemented on the branch (`requireCredential`, `auditLog`, `registerTools`).

## 1. Shared helpers and schemas

- [x] 1.1 `apps/api/src/utils/listCap.ts` + `utils/tests/listCap.test.ts`: `capList(rows, max)` returns `{ data, total }`; cases: under, equal, over, empty.
- [x] 1.2 `packages/shared/src/schemas/mcp.ts` + test: `getReportToolSchema` (`type` enum plus `reportFiltersSchema` fields; use the base object if the schema has `.refine`), `exchangeRateToolSchema` (reuse `currencyRateQuerySchema`), `listImportedToolSchema` (`status` optional), `setArchivedToolSchema` (`id`, `archived`). Update tools extend `updateAccountSchema`/`updateCategorySchema` with `id`. Export from the index. Verify: unknown key rejected, `archived` required.
- [x] 1.3 `v1/utils/v1Audit.ts` + test: capture created id from `transaction`, `account` or `category` body key. Verify: existing transaction cases still pass.

## 2. REST adapters

- [x] 2.1 `v1/controllers/v1.controller.ts` + test: capped handlers for debts and imported transactions (call the services, apply `capList`; notifications and others reuse existing controllers).
- [x] 2.2 `v1.routes.ts`: add the 8 read routes (`requireScope("read")`, existing validators). Verify: supertest matrix below.
- [x] 2.3 `v1.routes.ts`: add 4 account and 4 category write routes and `DELETE /transactions/:id`, each with `auditV1Write`, `requireScope("write")`, `validate(sharedSchema)` where there is a body. Update the router doc comment (24 routes).
- [x] 2.4 Confirm no route exists for hard delete or import (404 test).

## 3. MCP adapters

- [x] 3.1 `mcp/controllers/tools.controller.ts` (split into per-resource registration files under `mcp/controllers/` if it exceeds ~250 lines): register 5 read tools with `readOnlyHint`; reads use `runRead` and `capList` where required.
- [x] 3.2 Register 7 write tools inside the `write`-scope branch via `runWrite`; each parses args with the shared schema; `delete_transaction` has `destructiveHint: true`, `idempotentHint: false` and a description naming the cascade; archive tools `idempotentHint: true`; create tools note that retries may duplicate.
- [x] 3.3 Unit test (mock services): read credential registers 9 tools, write credential 18; each tool calls the right service with `auth.extra.userId` only; write handler refuses without scope; one `auditLog` call per write, success and failure; extra input keys are stripped.

## 4. Test matrix (testcontainers, Docker via CLAUDE.local.md)

- [x] 4.1 `src/tests/integration/v1.crud.integration.test.ts` (supertest): for each new route, success, 401 without key, 403 with a read key (writes), 404 for another user's id, 400 for invalid input; mass-assignment on account PUT; archive/restore idempotent; routes for hard delete and import return 404; caps (250 imported rows give 100); audit line per write incl. 403 and DELETE.
- [x] 4.2 Same file, delete matrix: plain, transfer, with shared expense plus participant plus settlement request (all gone), settlement payment transaction (request kept, link null), repeat delete 404, notifications removed.
- [x] 4.3 `src/tests/integration/mcp.crud.integration.test.ts` (SDK client): tool lists (9 read, 18 write), read key cannot call any write tool and nothing changes, cross-user refusals, delete matrix subset, `destructiveHint` present, audit lines.
- [x] 4.4 Parity cases inside 4.1/4.3 (no separate file): for one seeded user, each new REST read and its MCP tool return equal data (`get_report` for all three types); a refused case (foreign id) is refused on both; write ops produce the same DB state via REST and MCP.

## 5. Docs and close out

- [x] 5.1 Update `docs/` API page if one lists `/v1` routes or MCP tools; add `docs/KNOWN_ISSUES.md` entries: hard account/category delete orphans transactions; no idempotency on creates; account currency change unguarded.
- [x] 5.2 `npm run typecheck`, `npm run lint`, `npm run test` pass; Docker integration suite passes. (Verified: typecheck clean, changed-file lint clean, Docker suites green; repo-wide lint is KNOWN_ISSUES #008; `env.test.ts` PUBLIC_API_URL default fails only because the local .env sets it.)
- [x] 5.3 (throwaway user via REST plus MCP tools/list, list_debts, get_report; delete and read-key absence covered by integration suites) Manual on `api-flowledger-dev`: with a write key from an MCP client create and archive a throwaway account, delete a throwaway transaction; with a read key confirm write tools are absent.

## Acceptance criteria

- 26 `/v1` routes and 20 MCP tools (this change's share) exist and no others; existing 7 routes and 6 tools behave as before.
- No migration, no new scope, no new service, account/category delete reuse the web app's services unchanged.
- All matrix cases in section 4 pass, including cross-user isolation and read-key refusal on REST and MCP.

## 6. Account and category delete parity with the web UI (operator decision)

- [x] 6.1 Web semantics recorded (design decision 3) from `accounts/services/delete.service.ts`, `categories/services/delete.service.ts` and schema `onDelete` rules.
- [x] 6.2 `DELETE /v1/accounts/:id` and `/v1/categories/:id` in `v1.routes.ts` reusing the internal controllers (`auditV1Write`, `requireScope("write")`); router doc comment says 26 routes.
- [x] 6.3 MCP `delete_account` and `delete_category` in `tools.writes.controller.ts` via `runWrite` with `destructiveHint`, `idempotentHint: false`, confirmation wording; unit tests updated.
- [x] 6.4 Integration: REST (204, read key 403, other user 404, 401, effects on transactions and transfer legs) and MCP (tool list 28 with annotations, read refusal, cross-user, same error text as REST).
- [x] 6.5 `docs/PUBLIC_API.md` and KNOWN_ISSUES #011 updated; parity audit recorded.
- [x] 6.6 lint, typecheck, API tests with Docker, `openspec validate --changes --strict` pass.
- [x] 6.7 Staging smoke through the public dev hostname with a throwaway user, cleaned up.

## 7. Parity round: imported review, notifications, profile, misc reads

- [x] 7.1 Shared schemas: `updateUserPreferencesSchema` (auth.ts), `publicBatchImportedSchema`, `publicBatchImportImportedSchema`, `importedIdsToolSchema`, `importImportedToolSchema`, `updateImportedToolSchema`, `markNotificationsReadToolSchema` / `markNotificationsReadInputSchema` (mcp.ts) + tests (cap 50, ids mode only, exactly-one rule).
- [x] 7.2 `users/services/preferences.service.ts` (`updatePreferences` over the unchanged `updateProfile`, current email forwarded) + `v1/controllers/v1.profile.controller.ts` + unit tests.
- [x] 7.3 `v1/v1.misc.routes.ts`: 12 routes (imported review incl. batch, notification unread-count/read/read-all, `GET`/`PATCH /me`), `requireScope`, `auditV1Write`, mounted in `v1.routes.ts`.
- [x] 7.4 MCP: `get_transaction`, `list_currencies`, `get_profile`, `unreadCount` on `list_notifications` (`tools.reads.controller.ts`); `tools.imports.controller.ts` (4 tools); `tools.user.controller.ts` (`update_preferences`, `mark_notifications_read`); wired in `tools.controller.ts`; unit tests.
- [x] 7.5 Integration (`personalReview.integration.test.ts`, Docker): authorized success, read key 403 / hidden tools, 401, cross-user 404 or skip, non-pending 400, batch cap 51 and filtered mode 400, all-or-nothing batch, REST/MCP parity. Existing tests that assumed import was unrouted updated (404 now asserted on unlisted routes).
- [x] 7.6 `docs/PUBLIC_API.md` and KNOWN_ISSUES #021 (batch import not atomic, foreign ids skipped) updated.
- [x] 7.7 lint, typecheck, unit and Docker integration tests for the touched files, `openspec validate expand-personal-api-crud --strict` pass.
