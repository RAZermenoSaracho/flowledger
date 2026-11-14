# Tasks

Prerequisites: B-004 is merged. Work on a feature branch from the latest `razs_ai`. Read `design.md` before each phase.

Rules that apply to every task:
- Every new or changed `controllers/`, `services/`, `utils/`, `hooks/` and `components/` file gets a matching `tests/` file (docs/TESTING.md).
- Every export gets TSDoc.
- Relative api imports use `.js`.
- Request validation uses only `@flowledger/shared` schemas.
- Every query is scoped by `userId`.
- No raw SQL.

API paths below are relative to `apps/api/src/modules/notificationModels/` unless stated. Phases run in order.

## 1. Data model, configuration and shared contracts

- [x] 1.1 Add `NotificationModel`, `NotificationModelVersion`, `NotificationRun` and the enums `NotificationModelVisibility` and `NotificationRunStatus` (`queued processing completed skipped failed`) to `database/prisma/schema.prisma`, exactly as in design §7, including `NotificationRun.userId`, `workerId`, the three indexes, and the `NotificationWorker` liveness table. Add back-relations on `User` and `Transaction` only. Run `npm run prisma:migrate -- --name notification_models` and `npm run prisma:generate`. Verify: the migration has only `CREATE TYPE`, `CREATE TABLE` and index statements, and `npm run typecheck` passes.
- [x] 1.2 Add `NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL` (default 4) and `NOTIFICATION_PROCESSOR_MAX_CONCURRENT_PER_USER` (default 2) to the Zod schema in `apps/api/src/config/env.ts`: `z.coerce.number().int().min(1).max(64)`, plus a refinement that per-user ≤ global, with a message naming both variables. Add both to `.env.example` with a comment on meaning and range. Verify: an env test covers the defaults, a non-integer, 0, 65, and per-user above global each failing with the variable named.
- [x] 1.3 Add `packages/shared/src/schemas/notificationModels.ts`, exported from the barrel:
  - the slot schema (`key` matching `^[a-z][a-z0-9_]{0,39}$`, `kind` one of `account | category | group`, `label`, `required`) and the slots array (≤20, unique keys);
  - `bindings` (record of slot key to id) and `settings` (≤30 keys, string values ≤500);
  - `code` (≤20,000 characters);
  - the create and update schemas (name 1–80 characters, description ≤500, `isActive`, `visibility`);
  - `notificationTestSchema` (`text` 1–4,000, optional `code` and `settings`);
  - `notificationIngestSchema`: `z.object({ text: z.string().min(1).max(4000) }).strict()`, the whole public contract;
  - `notificationProposalSchema`, a discriminated union on `kind` (`expense | income | transfer | skip`) with decimal-string amounts reusing `decimalAmountSchema`, `name` 1–160, slot-key references, and a skip `reason` ≤200;
  - `updateFromSourceSchema` (`versionId`, optional `bindings`).

  Verify: `packages/shared/src/schemas/tests/notificationModels.test.ts` covers:
  - valid and invalid slots;
  - a float amount rejected;
  - a transfer requiring `to_account`;
  - the skip reason length;
  - an ingest body with an extra field (e.g. `title`) rejected.
- [x] 1.4 Extend `createApiKeySchema` in `packages/shared/src/schemas/apiKeys.ts` with `ingestOnly: boolean` (default false) and a refinement rejecting `ingestOnly && allowWrite`. Verify: the shared apiKeys schema test covers the new refinement.
- [x] 1.5 Give `createTransaction(userId, body, tx?)` in `apps/api/src/modules/transactions/services/create.service.ts` an optional `Prisma.TransactionClient`. When `tx` is given, it runs its body on `tx` instead of opening `prisma.$transaction`; behavior is otherwise unchanged. Update its TSDoc. Verify: the existing `create.service.test.ts` passes unchanged, plus one new case asserting that, with `tx`, it uses `tx` and does not call `prisma.$transaction`.

## 2. Sandbox runner (api)

- [x] 2.1 Add the exact-version `pyodide` dependency to `apps/api`. It is loaded from `node_modules`, with no CDN or network fetch. Add `sandbox/prelude.py`:
  - the AST validator (rules in design §2, layer 1, returning `[{line, col, message}]`);
  - the restricted builtins and the `re` namespace (layer 2);
  - the helpers `expense`, `income`, `transfer`, `skip`, `amount`, `normalize`, `parse_date` and `Decimal` (design §3);
  - `run(code, text, ctx)`, returning `{kind, proposal|reason|error{message,line}, stdout}`, with print capture capped at 4 KB;
  - `validate(code)`.
- [x] 2.2 Add `sandbox/sandboxChild.mjs`. It loads Pyodide from `node_modules`, deletes `fetch` and `WebSocket` from `globalThis`, runs the prelude, removes `js`, `pyodide`, `pyodide_js` and `_pyodide` from `sys.modules`, then writes `{"ready":true}`. It reads exactly one JSON request line (`{mode:"run"|"validate", code, text?, ctx?}`), writes one JSON response line and exits.
- [x] 2.3 Add `sandbox/runScript.ts`, exporting `runScript(request, { signal? })` and `validateScript(code)`. Each:
  - spawns `node --permission --allow-fs-read=<pyodide dir>,<sandbox dir> --max-old-space-size=128 sandboxChild.mjs` with `env: {}` and no shell;
  - waits for ready (15 s total lifetime), then sends the request;
  - kills on 2 s of script time, more than 64 KB of stdout, or more than 256 MB of memory. For memory, use the V8 WebAssembly max-memory-pages flag if it works under Node 24; otherwise the parent samples `ps -o rss= -p <pid>` every 100 ms. Note the chosen mechanism in a TSDoc line;
  - maps kills to `{kind:"error", error:{message:"timeout"|"resource_limit"}}`;
  - when `signal` aborts, kills the child and rejects with an `AbortError` (used by graceful shutdown).

  Add `acquirePlaygroundSlot(userId)`: a fixed in-process cap of 2 concurrent tests, 1 per user, returning 503 when busy.

  Verify: `sandbox/tests/runScript.test.ts`, which runs the real sandbox and is not mocked, covers:
  - Pyodide loading under `--permission`, and file writes and `child_process` failing inside the child;
  - the Plata example → proposal `amount "1234.50"`, `currency "MXN"`;
  - a promotion → skip;
  - `None` → skip with reason `no result`;
  - a raised exception → error with line;
  - a float amount → `invalid result`;
  - validation errors for each of `import os`, `__import__`, `().__class__`, `x.gi_frame`, `"{0.__class__}".format(1)`, `class A: pass`, `re.enum`, `open("/etc/passwd")` and `getattr`;
  - `while True: pass` → timeout;
  - `"a" * 10**9` → resource_limit;
  - `re.search(r"(a+)+$", "a"*40+"b")` → timeout;
  - the child env is empty;
  - two concurrent runs share no globals;
  - abort kills the child.

  **If Pyodide cannot load under `--permission`, stop and report to the owner.** It is a security blocker, not something to work around.

## 3. Model API (JWT)

- [x] 3.1 Add `services/create.service.ts`, `read.service.ts`, `update.service.ts` and `delete.service.ts` for models, all scoped `{ id, userId }` with `notFound()` otherwise:
  - Save rejects code that fails `validateScript` (400 with line errors).
  - Bindings must reference the caller's non-archived accounts and categories, or Groups they are a member of.
  - Activation, and any slot or binding change while active, requires every required slot bound (400 listing slots).
  - The read includes `endpointPath`, `update: { available, installedVersion, latestVersion, localCodeModified }`, the latest run status, and `queued`/`processing` counts.
  - The list uses `createSieve` pagination like other list services.
  - Deleting a model cascades its runs. The delete confirmation in the UI (task 5.4) states how many runs are pending.

  Verify: service tests with `mockDeep<PrismaClient>()` cover isolation, activation rules, invalid code and foreign bindings.
- [x] 3.2 Add `services/test.service.ts`. It takes `acquirePlaygroundSlot`, runs the draft code and settings with the model's bindings, resolves slot keys to record names for `transactionPreview`, and parses the mapped input with the shared `transactionSchema` to report validation problems. It writes nothing and creates no run. Also add `validate` through `validateScript`. Verify: the service test asserts no `create`/`update` Prisma calls, a missing mapping, and 503 when the slot is busy.
- [x] 3.3 Add thin controllers and `notificationModels.routes.ts` for the web routes in design §8, excluding the queue/logs routes (phase 4) and the library routes (phase 6). Mount it in `app.ts` behind `requireAuth`. Verify: `tests/notificationModels.routes.test.ts` (supertest plus testcontainers) covers CRUD, 404 for another user's model, activation 400, and test without side effects.

## 4. Persistent queue, ingestion and worker

- [x] 4.1 API keys: widen `CredentialScope` to include `ingest` (`apps/api/src/types/credential.types.ts`), and store `["ingest"]` for `ingestOnly` in `modules/apiKeys/services/create.service.ts`. Confirm that OAuth scope validation (`packages/shared/src/schemas/oauth.ts`) cannot yield `ingest`. Verify: the apiKeys create service test, and a `/v1` test showing an ingest key gets 403 on `GET /v1/accounts` and a write key gets 403 on the ingest route.
- [x] 4.2 Add `services/ingest.service.ts`. It:
  - resolves the owner's active model (404 otherwise);
  - enforces the 500-queued-runs-per-user capacity (429 with `Retry-After: 60`);
  - computes the dedupe key (optional `Idempotency-Key` header, else `sha256(text):floor(now/600000)`);
  - creates the queued run with `userId` copied from the model, and on P2002 returns the existing run with `duplicate: true`.

  Add its controller. It responds `202 { runId, status, duplicate }` only after the insert resolves, and maps any other DB error to 503. The API never claims or executes runs. In `modules/v1/v1.routes.ts`, add `POST /notification-models/:id/notifications` with `auditV1Write("notification.ingest")`, `requireScope("ingest")` and `validate(notificationIngestSchema)`, using the existing JSON parser and `/v1` limiter. Teach `v1Audit` the `runId` key. Verify:
  - the service test covers dedupe in both modes, an inactive model returning 404, and capacity at 500;
  - the v1 route test covers a JSON `{text}` → 202, empty, oversized or extra-field bodies → 400, a foreign model → 404, and a simulated insert failure → 503 with no run;
  - a log-capture assertion shows no notification text in the morgan or audit output.
- [x] 4.3 Add `services/claim.service.ts`, exporting `claimNextRun(workerId)`. It is one `prisma.$transaction(fn, { isolationLevel: "Serializable" })` implementing design §5's claim:
  - `groupBy` `processing` by `userId` and by `modelId`, and stop at the global limit;
  - `groupBy` `queued` heads by `(userId, modelId)`, dropping users at the per-user limit;
  - sort by user processing count, then model processing count, then head `receivedAt`;
  - take the chosen model's oldest queued run;
  - a guarded update to `processing` with `workerId` and `startedAt`.

  It retries `P2034` up to 3 times and returns the run or `null`. Verify: the unit test (mocked Prisma) covers the global limit, the per-user limit, a user with 0 running preferred over a backlogged user, a model with 0 running preferred within one user, oldest-first within a model, and the `P2034` retry.
- [x] 4.4 Add `services/processRun.service.ts`:
  - it reloads the model (inactive → `skipped`/`model_inactive`);
  - it runs `runScript` and validates the result with `notificationProposalSchema`;
  - it maps slots to bindings (unknown or unbound → `failed`/`mapping_missing:<key>`) and builds `TransactionInput` per design §4;
  - in one `prisma.$transaction`, it re-checks that the model is active (otherwise `skipped`/`model_inactive`), calls `createTransaction(userId, input, tx)` and then updates the run to `completed` with `transactionId`, guarded by `where: { id, status: "processing", workerId }`, throwing on count 0;
  - an `HttpError` from `createTransaction` becomes `failed` with its message, truncated to 500 characters;
  - other terminal outcomes set `finishedAt` with the same guard.

  Verify: the service test covers each outcome, transfer and income mapping, date defaulting to `receivedAt`, and that a guard miss rolls back (no transaction is committed).
- [x] 4.5 Add `services/maintenance.service.ts`, exporting:
  - `failLostRuns()`: `processing` runs whose `workerId` has no `NotificationWorker` row with `lastSeenAt` within 2 min → `failed`, reason `worker_lost`, `finishedAt`. It also deletes worker rows not seen for 1 hour;
  - `applyRetention()`: null `text` on terminal runs with `finishedAt` older than 7 days, and delete terminal runs with `finishedAt` older than 30 days. Both filter `status in (completed, skipped, failed)` and non-null `finishedAt`.

  Verify: the unit test asserts the exact `where` clauses, and that `queued`/`processing` runs are never matched.
- [x] 4.6 Add `notificationRunWorker.ts` at the module root, patterned on `syncfyAutoSyncScheduler.ts`:
  - `start()` and `stop()`, with `workerId = randomUUID()` per start;
  - `start()` inserts its `NotificationWorker` row (`hostname`, `pid`);
  - it polls every 2 s, looping `claimNextRun` while it returns a run and in-flight < global;
  - it touches `lastSeenAt` every 15 s;
  - `failLostRuns` and `applyRetention` every minute, and once at `start()`;
  - `stop()` stops claiming, lets runs in their create step finish, aborts sandbox executions and returns those runs to `queued` (guarded by `workerId` and `processing`), resolves within 10 s, and deletes its worker row.

  `server.ts` is not changed and never imports the worker. Verify: the worker unit test (mocked services) covers the in-flight cap, the liveness touch, minute tasks, and stop returning aborted runs to `queued` while never requeueing a run past its create step.
- [x] 4.7 Add `listQueue` (`queued` and `processing`, oldest first) and `listLogs` (terminal, newest first) to `services/read.service.ts`, both scoped `{ modelId, userId }` and paginated. Add `GET /notification-models/:id/queue` and `/logs`. Text appears only while retained; the queue returns the first 80 characters. Verify: covered in the routes test, including 404 for another user's model.
- [x] 4.8 Integration: add `src/tests/integration/notificationQueue.integration.test.ts` (testcontainers, real sandbox, global limit 2, per-user 1, the API app via supertest, and two `notificationRunWorker` instances with distinct `workerId`s standing in for two worker processes). It covers:
  - ingest → exactly one transaction with the exact decimal amount and bound account;
  - a duplicate POST;
  - a promotion skipped;
  - a model deactivated while queued;
  - a missing mapping;
  - **saturation:** 20 POSTs for user A and 2 for user B are all accepted (202), never more than 2 `processing` overall or 1 per user at any sampled moment, B's runs finish before A's backlog drains, and every run reaches a terminal state with no duplicate transaction;
  - **FIFO:** one model's runs start in `receivedAt` order;
  - **persistence:** stop both workers with runs still queued, start a new one, and every queued run is processed;
  - **crash:** a `processing` run whose worker row is stale becomes `failed`/`worker_lost` with no transaction and is never executed again;
  - **capacity:** the 501st queued run → 429.

  Add the notification-model, queue, logs and ingest routes to `financialIsolation.integration.test.ts`, so that user B cannot read, test, ingest into, or list the queue or logs of A's model. Verify: both suites pass with the Docker VM.

- [x] 4.9 Add the worker process entry point `apps/api/src/worker.ts`. It is bootstrap only: excluded from coverage like `server.ts`, and added to the `vitest.config.ts` coverage exclude list. It:
  1. imports `env`, which fails fast on bad config;
  2. probes the schema with `notificationRun.findFirst({ select: { id: true } })` and `notificationWorker.count()`; on `P2021`/`P2022` it logs `notification worker: schema not migrated` and exits 1;
  3. starts `notificationRunWorker`, and on `SIGTERM`/`SIGINT` runs `await worker.stop()`, `prisma.$disconnect()`, then `process.exit(0)`;
  4. logs a start line and a stop line with `workerId`, and never logs notification text.

  Add `"start:worker": "node dist/worker.js"` and `"dev:worker": "tsx watch src/worker.ts"` to `apps/api/package.json`. Add `dev:worker` and `start:worker` to the root `dev` and `start` `npm-run-all --parallel` lists. Verify: `npm run build -w @flowledger/api` emits `dist/worker.js`; with the local DB, `npm run start:worker -w @flowledger/api` starts, writes a `NotificationWorker` row, and on Ctrl-C deletes it and exits 0; against an unmigrated database it exits 1 with the message.
- [x] 4.10 Add `GET /health/notification-worker` next to `/health` in `app.ts`, with the logic in `services/read.service.ts`. It returns `200 { workers: n }` when at least one `NotificationWorker` has `lastSeenAt` within 60 s, otherwise `503 { workers: 0 }`. It is unauthenticated and exposes nothing else. Verify: a routes test covers 200 and 503.

## 5. Web UI

- [x] 5.1 Add the `codemirror` and `@codemirror/lang-python` dependencies to `apps/web`. Add `pages/NotificationModels/components/CodeEditor.tsx` (a controlled value, read-only mode, line error markers). Verify: a component test for value and onChange, and `contentSecurityPolicy.http.test.ts` still passes unchanged.
- [x] 5.2 Add `services/notificationModels.client.ts` and `types/notificationModels.types.ts`, and add MSW handlers. Verify: handler-backed hook tests are added in 5.3 and 5.4.
- [x] 5.3 Add `NotificationModelsPage.tsx`: a `ListView` with `usePagination`, `RecordCard` rows (name, active badge, visibility, last run status), a New button, and a link to the Library. Register routes in `constants/routes.ts` and `main.tsx`, and add the nav item in `layout/config/navigation.ts`. Verify: a page test at 375px for the list, empty state and navigation.
- [x] 5.4 Add `NotificationModelDetailPage.tsx` with a `hooks/useNotificationModelForm.ts` adapter on `useFormDraft`, mirroring `useAccountForm`. `/notification-models/new` starts from a commented template script. The `FormView` tabs, in order:
  - **Form:** fields, an endpoint `CopyRow` plus a request example (`Authorization: Bearer <ingest key>`, body `{"text": "…"}`) and an ingest-key link, a slots table with binding selects over the owner's records, settings, and origin/version with update.
  - **Code:** `CodeEditor` bound to `draft.values.code`, Check calling `validate`, and a `<details>` helper reference from `constants/notificationHelpers.ts`.
  - **Playground:** text area, Run calling `test` with draft code and settings, outcome, preview, error line, stdout, and a "nothing is created" note.
  - **Queue:** read-only, from `components/NotificationQueueList.tsx`: a `ListView` with `usePagination` over `/queue`, polling every 10 s while the tab is open. Each row shows status, position (queued rows only: offset + index + 1), received time, waiting time, started time, and the 80-character preview. It has no cancel, retry, reorder, delete, start/stop or concurrency controls.
  - **Logs:** read-only, from `components/NotificationLogsList.tsx`: a `ListView` with `usePagination` over `/logs`, with status badge, reason, finished time, transaction link, and text while retained.

  The record actions menu has Publish (a confirm listing the published fields) and Delete (a confirm stating the pending run count). Verify: `tests/NotificationModelDetailPage.test.tsx`, `hooks/tests/useNotificationModelForm.test.ts`, and component tests for both lists cover:
  - tab navigation with the draft kept;
  - a save error with line;
  - the activation error listing slots;
  - a playground run without saving;
  - queue positions and the absence of any action button;
  - the logs list;
  - the publish and delete confirms.
- [x] 5.5 Add "Notification ingest only" to `pages/Profile/components/CreateApiKeyForm.tsx`, disabling write while it is checked. The key is still shown once through `ApiKeyRevealDialog`. Verify: the `CreateApiKeyForm` test.

## 6. Community library

- [x] 6.1 Add `services/library.service.ts` with `publish`, `listLibrary`, `getLibraryModel`, `install` and `updateFromSource`. `publish` creates version `max+1` with a snapshot of name, description, code, slots and settings (no bindings) and sets `public`, inside one `$transaction`. Setting `private` is the normal update. The other functions:
  - list public models with ≥1 version, the latest version and the author's public username (no email);
  - show the latest version detail;
  - install: a private, inactive copy with empty bindings and `sourceVersionId`.

  `updateFromSource` implements the merge rules from design §9: 400 listing unbound required slots, the user's name kept, settings merged, and bindings kept for the same key and kind.

  Verify: service tests cover snapshot immutability, bindings never published, the install copy being independent, update-available and `localCodeModified` computation, the merge rules, 400 for missing bindings, and that deleting the original leaves copies working.
- [x] 6.2 Add the controllers and routes `/notification-library`, `/notification-library/:modelId`, `/notification-library/:modelId/install`, `/notification-models/:id/publish` and `/notification-models/:id/update-from-source`. Verify: the routes test covers publish → install by another user → author publishes v2 → the copy sees an update → applying it with the new binding keeps the copy active; another user cannot publish or update a model that isn't theirs (404).
- [x] 6.3 Add `NotificationLibraryPage.tsx` (browse, view code read-only, install → navigates to the copy's Form tab). Add the update `ModalDialog` on the Form tab: current and new code side by side read-only, a local-modification warning, and selects for new required slots. Verify: page and dialog tests.

## 7. Docs and acceptance

- [x] 7.1 Write `docs/NOTIFICATION_MODELS.md`:
  - the architecture decision and when to revisit it;
  - the script contract and helper reference;
  - the sandbox layers and residual network risk;
  - the queue: claim, fairness, FIFO, capacity and backpressure;
  - the concurrency env vars with defaults, ranges and misconfiguration behavior;
  - the run lifecycle diagram and crash recovery (never-started vs in-flight);
  - the two processes, the worker entry point, graceful shutdown, restart recovery, deploy ordering, the schema readiness check, and the health check (design §12);
  - retention (text 7 days, terminal runs 30 days, pending work never deleted);
  - the ingest contract with a curl example.

  Also update `docs/DATA_MODEL.md` (the new models), `apps/api/CLAUDE.md` (the `notificationModels/` module with `sandbox/`, the worker, and the `src/worker.ts` entry point next to `server.ts`), `apps/web/CLAUDE.md` (route table) and root `CLAUDE.md` (the env var table and docs table). Verify: grep finds both `NOTIFICATION_PROCESSOR_MAX_CONCURRENT_*` names in `env.ts`, `.env.example`, `CLAUDE.md` and the new doc.
- [x] 7.2 From the repo root, `npm run typecheck`, `npm run lint` and `npm run test` pass, as do the Docker-backed integration suites. Run `openspec validate b007-notification-processor --strict`. Verify: command output is recorded in the PR.
- [x] 7.3 Deployment and supervision. The deploy script lives outside the repo, so the owner applies these on the host, and the implementer documents them in `docs/NOTIFICATION_MODELS.md` (§ Deployment) and the `deploy` skill (`.claude/skills/deploy/SKILL.md`):
  1. One-time, from `~/production/flowledger/apps/api`:

     ```
     pm2 start npm --name flowledger-prod-worker --kill-timeout 15000 --exp-backoff-restart-delay 1000 -- run start:worker
     pm2 save
     ```

  2. In `~/scripts/deploy-flowledger-prod.sh`, add `pm2 restart flowledger-prod-worker --update-env` right after `pm2 restart flowledger-prod-api`, before `pm2 save`. The order stays migrate → build → API → worker.
  3. The same for `flowledger-dev`, with its own process name.
  4. After deploy: `curl -fsS http://127.0.0.1:4000/health/notification-worker` returns 200, and `pm2 status` shows both processes online.

  Verify: the doc and the skill contain the exact commands, and the PR description lists the two manual host steps for the owner. Implementation does not edit the host or the external script.
- [x] 7.4 Staging acceptance on `flowledger-dev` (owner present):
  - create a Plata model, check it, run it in the playground, bind slots and activate;
  - create an ingest key;
  - POST `{"text": …}` → exactly one correct transaction;
  - send a duplicate → none;
  - send a promotion → skipped in Logs;
  - deactivate → 404;
  - the malicious snippets from 2.3 fail safely through the playground;
  - a burst above the global limit shows in the Queue tab and drains;
  - with the worker stopped (`pm2 stop`), the API still returns 202, the Queue tab shows the backlog, and `/health/notification-worker` returns 503; `pm2 start` drains it;
  - `kill -9` of the worker mid-execution → that run is `worker_lost` with no transaction, the API stays up, and PM2 restarts the worker;
  - a second account installs the model from the library, binds its own records and ingests successfully.

  Record the outcomes in the PR. Verify: a PR comment with the checklist.
- [x] 7.5 Update `SHORT_TERM_ROADMAP.md` (ST-010, ST-011 and ST-032 statuses; B-007 status) and log any deferred finding in `docs/KNOWN_ISSUES.md`. Verify: the diff touches only those rows and entries.

## 8. Visual rules (Form ↔ Code)

- [x] 8.1 Add `notificationRulesSchema` (design §13) and `generateNotificationCode(rules)` plus `DEFAULT_NOTIFICATION_RULES` to `packages/shared` (new `notificationRules.ts`, exported). Verify: tests cover each condition, extract, action and value kind, keyword order, escaping of quotes and backslashes in text and patterns, determinism, and the §13 example output exactly.
- [x] 8.2 Add `parse(code)` to `sandbox/prelude.py` and the `parse` mode to `sandboxChild.mjs`. Export `parseRules(code, userId)` from `runScript.ts`, which takes the playground slot and returns 503 when busy. Add `POST /notification-models/parse-rules` (JWT, shared body schema, `{ rules } | { unsupported: [{ line, message }] } | { errors: [...] }` for syntax errors). Verify:
  - real-sandbox tests: the parser accepts every canonical construct and equivalent spellings (`re.IGNORECASE`, `flags=re.I`, keyword order, comments);
  - it rejects loops, `print`, else branches, extra assignments, ternaries, f-strings and a missing fallback, with line numbers;
  - round trip: fixtures generated by 8.1 parse back deep-equal;
  - a generated script and the §13 example produce identical Playground results.
- [x] 8.3 Web: rebuild the Form tab's processing section as a rule builder bound to the draft code through the shared generator. It covers ordered rules, conditions, extract, action and fallback, using existing form controls, and works on mobile. Parse on opening Form or leaving Code after the code changed. Show loading, the unsupported notice with lines, the syntax-error notice, the replace-with-confirm action, and the one-time canonical-rewrite notice. Generate new-model code from `DEFAULT_NOTIFICATION_RULES`. Update the English helper reference. Verify: component and page tests cover building a rule (code updates without a save), editing code and returning to Form (rules update), unsupported code (no rules, notice, code untouched), replace confirm and cancel, tab switches keeping unsaved edits, and save and reload consistency.
- [x] 8.4 End to end: an integration test ingests "Purchase completed for $150.00" through a model whose code came from the §13 rules, producing an expense of `150.00` named "Purchase completed" in the user's currency. Library install and update keep the script, and the copy's Form shows the same rules. Staging walkthrough: Form → Code → Form → Playground → real ingestion. Verify: the test passes and the walkthrough is recorded in the PR.
