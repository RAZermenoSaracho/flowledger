# Tasks

Prerequisites: B-004 is merged. Work on a feature branch from the latest `razs_ai`. Read `design.md` before each phase.

Rules that apply to every task:
- Every new or changed `controllers/`, `services/`, `utils/`, `hooks/` and `components/` file gets a matching `tests/` file (docs/TESTING.md).
- Every export gets TSDoc.
- Relative api imports use `.js`.
- Request validation uses only `@flowledger/shared` schemas.
- Every query is scoped by `userId`.
- No raw SQL.

API paths below are relative to `apps/api/src/modules/notificationModels/` unless stated.

Phase order is strict. Phase 1 must pass before anything else.

## 1. Sandbox spike (gate)

- [ ] 1.1 Add the `pyodide` dependency to `apps/api` (exact version, loaded from `node_modules`, with no CDN or network fetch). In a throwaway script under the scratchpad, verify on Node 24:
  - `node --permission --allow-fs-read=<pyodide dir>,<sandbox dir>` loads Pyodide and runs `1+1`, while file writes and `child_process` throw.
  - The memory cap: try the V8 WebAssembly max-memory-pages flag first. Fall back to parent RSS sampling with `ps -o rss= -p <pid>` every 100 ms, and confirm that `"a" * 10**9` is killed below 256 MB.
  - Cold-start time from spawn to ready, as the median of 5 runs.

  Record the results (flags, chosen memory mechanism, cold start, and whether a pre-warm pool is needed because cold start exceeds 2 s) in `docs/NOTIFICATION_MODELS.md` under "Sandbox runtime". Verify: the doc section exists with measured numbers. **Stop and report to the owner if Pyodide cannot load under `--permission`.**

## 2. Data model and shared contracts

- [ ] 2.1 Add `NotificationModel`, `NotificationModelVersion`, `NotificationRun` and the enums `NotificationModelVisibility` and `NotificationRunStatus` to `database/prisma/schema.prisma`, exactly as in design §7. Add back-relations on `User` and `Transaction` only. Run `npm run prisma:migrate -- --name notification_models` and `npm run prisma:generate`. Verify: the migration has only `CREATE TYPE`, `CREATE TABLE` and index statements, and `npm run typecheck` passes.
- [ ] 2.2 Add `packages/shared/src/schemas/notificationModels.ts`, exported from the barrel:
  - the slot schema (`key` matching `^[a-z][a-z0-9_]{0,39}$`, `kind` one of `account | category | group`, `label`, `required`) and the slots array (≤20, unique keys);
  - `bindings` (record of slot key to id) and `settings` (≤30 keys, string values ≤500);
  - `code` (≤20,000 characters);
  - the create and update schemas (name 1–80 characters, description ≤500, `isActive`, `visibility`);
  - `notificationTestSchema` (`text` 1–4,000, optional `code` and `settings`);
  - `notificationIngestSchema` (`text` 1–4,000);
  - `notificationProposalSchema`, a discriminated union on `kind` (`expense | income | transfer | skip`) with decimal-string amounts reusing `decimalAmountSchema`, `name` 1–160, slot-key references, and a skip `reason` ≤200;
  - `updateFromSourceSchema` (`versionId`, optional `bindings`).

  Verify: `packages/shared/src/schemas/tests/notificationModels.test.ts` covers valid and invalid slots, a float amount rejected, a transfer requiring `to_account`, and a skip reason length.
- [ ] 2.3 Extend `createApiKeySchema` in `packages/shared/src/schemas/apiKeys.ts` with `ingestOnly: boolean` (default false) and a refinement rejecting `ingestOnly && allowWrite`. Verify: the shared apiKeys schema test covers the new refinement.

## 3. Sandbox runner (api)

- [ ] 3.1 Add `sandbox/prelude.py`:
  - the AST validator (rules in design §2, layer 1, returning `[{line, col, message}]`);
  - the restricted builtins and the `re` namespace (layer 2);
  - the helpers `expense`, `income`, `transfer`, `skip`, `amount`, `normalize`, `parse_date` and `Decimal` (design §3);
  - `run(code, text, ctx)`, returning `{kind, proposal|reason|error{message,line}, stdout}`, with print capture capped at 4 KB;
  - `validate(code)`.
- [ ] 3.2 Add `sandbox/sandboxChild.mjs`. It loads Pyodide from `node_modules`, deletes `fetch` and `WebSocket` from `globalThis`, runs the prelude, removes `js`, `pyodide`, `pyodide_js` and `_pyodide` from `sys.modules`, then writes `{"ready":true}`. It reads exactly one JSON request line (`{mode:"run"|"validate", code, text?, ctx?}`), writes one JSON response line and exits.
- [ ] 3.3 Add `sandbox/runScript.ts`, exporting `runScript(request)` and `validateScript(code)`. Each:
  - spawns the child with the flags from spike 1.1, `env: {}` and no shell;
  - waits for ready (15 s total lifetime), then sends the request;
  - kills on 2 s of script time, more than 64 KB of stdout, or more than 256 MB of memory;
  - maps kills to `{kind:"error", error:{message:"timeout"|"resource_limit"}}`;
  - is bounded by a module-level semaphore of `env.NOTIFICATION_RUNNER_CONCURRENCY`.

  Export `acquireRunnerSlot(timeoutMs)` for the playground's 10 s wait. Add `NOTIFICATION_RUNNER_CONCURRENCY` (default 4) to `config/env.ts` and `.env.example`. If 1.1 required pre-warming, keep that many ready single-use children and replace each after use.

  Verify: `sandbox/tests/runScript.test.ts`, which runs the real sandbox and is not mocked, covers:
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
  - two concurrent runs share no globals.

## 4. Model API (JWT)

- [ ] 4.1 Add `services/create.service.ts`, `read.service.ts`, `update.service.ts` and `delete.service.ts` for models, all scoped `{ id, userId }` with `notFound()` otherwise:
  - Save rejects code that fails `validateScript` (400 with line errors).
  - Bindings must reference the caller's non-archived accounts and categories, or Groups they are a member of.
  - Activation, and any slot or binding change while active, requires every required slot bound (400 listing slots).
  - The read includes `endpointPath`, `update: { available, installedVersion, latestVersion, localCodeModified }` and the latest run status.
  - The list uses `createSieve` pagination like other list services.

  Verify: service tests with `mockDeep<PrismaClient>()` cover isolation, activation rules, invalid code and foreign bindings.
- [ ] 4.2 Add `services/test.service.ts`. It acquires a runner slot (503 after 10 s), runs the draft code and settings with the model's bindings, resolves slot keys to record names for `transactionPreview`, and parses the mapped input with the shared `transactionSchema` to report validation problems. It writes nothing. Also add `validate` through `validateScript`. Verify: the service test asserts no `create`/`update` Prisma calls are made and that a mapping is missing.
- [ ] 4.3 Add thin controllers and `notificationModels.routes.ts` for the web routes in design §8, excluding the library routes, which are phase 7. Mount it in `app.ts` behind `requireAuth`. Verify: `tests/notificationModels.routes.test.ts` (supertest plus testcontainers) covers CRUD, 404 for another user's model, activation 400, and test without side effects.

## 5. Ingestion and worker

- [ ] 5.1 API keys: widen `CredentialScope` to include `ingest` (`apps/api/src/types/credential.types.ts`), and store `["ingest"]` for `ingestOnly` in `modules/apiKeys/services/create.service.ts`. Confirm that OAuth scope validation (`packages/shared/src/schemas/oauth.ts`) cannot yield `ingest`. Verify: the apiKeys create service test, and a `/v1` test showing an ingest key gets 403 on `GET /v1/accounts` and a write key gets 403 on the ingest route.
- [ ] 5.2 Add `services/ingest.service.ts`. It:
  - resolves the owner's active model (404 otherwise);
  - enforces the 100-pending-runs cap (429), counted through `model: { userId }`;
  - computes the dedupe key (`Idempotency-Key`, else `sha256(text):floor(now/600000)`);
  - creates the queued run, and on P2002 returns the existing run with `duplicate: true`;
  - calls `worker.wake()`.

  Add its controller, and in `modules/v1/v1.routes.ts` add `POST /notification-models/:id/notifications` with `express.text({ type: "text/plain", limit: "8kb" })`, `auditV1Write("notification.ingest")`, `requireScope("ingest")` and validation, returning 202. Teach `v1Audit` the `runId` key. Verify:
  - the service test covers dedupe in both modes, an inactive model returning 404, and the cap;
  - the v1 route test covers text/plain and JSON, 400 for empty or oversized text, and 404 for a foreign model;
  - a log-capture assertion shows no notification text in the morgan or audit output.
- [ ] 5.3 Add `services/processRun.service.ts`:
  - it reloads the model (inactive → `skipped`/`model_inactive`);
  - it runs `runScript` and validates the result with `notificationProposalSchema`;
  - it maps slots to bindings (unknown or unbound → `failed`/`mapping_missing:<key>`) and builds `TransactionInput` per design §4;
  - it sets `committing` with the proposal, calls `createTransaction(model.userId, input)`, then sets `created` with `transactionId`;
  - `HttpError` from `createTransaction` becomes `failed` with its message, truncated to 500 characters.

  Verify: the service test covers each outcome, transfer and income mapping, date defaulting to `receivedAt`, and that a failure after `committing` never calls `createTransaction` twice.
- [ ] 5.4 Add `notificationRunWorker.ts` (module root, patterned on `syncfyAutoSyncScheduler.ts`):
  - `start()`, `wake()` and `stop()`, polling every 5 s;
  - optimistic `updateMany` claims up to the concurrency;
  - a minute tick that requeues runs `running` for more than 2 min while `attempts < 3` (else `failed`/`interrupted`), marks `committing` runs `failed`/`interrupted_during_create`, and nulls `text` on runs finished more than 7 days ago;
  - retry on spawn or infrastructure errors before `committing` only;
  - `stop()` stops claiming and awaits in-flight runs for up to 10 s.

  Start the worker in `server.ts`, and make `shutdown()` await `worker.stop()` (and the existing scheduler) before `prisma.$disconnect()`. Verify: the worker unit test (mocked Prisma and runner) covers claim races (`count 0` skipped), the recovery rules, retention and stop semantics.
- [ ] 5.5 Add `listRuns` to `services/read.service.ts` (scoped through `model: { userId }`) and `GET /notification-models/:id/runs` (owner only, newest first, paginated, text only while retained). Verify: covered in the routes test.
- [ ] 5.6 Integration: in `src/tests/integration/notificationIngestion.integration.test.ts` (testcontainers, real sandbox), cover:
  - ingest → worker → exactly one transaction with the exact decimal amount and bound account;
  - the duplicate POST;
  - a promotion skipped;
  - a model deactivated while queued;
  - a missing mapping;
  - ten simultaneous POSTs processed with no duplicates;
  - a simulated restart recovering queued runs.

  Add the notification-model and run routes to `financialIsolation.integration.test.ts` so that user B cannot read, test, ingest into or list runs of A's model. Verify: both suites pass with the Docker VM.

## 6. Web UI

- [ ] 6.1 Add the `codemirror` and `@codemirror/lang-python` dependencies to `apps/web`. Add `pages/NotificationModels/components/CodeEditor.tsx` (a controlled value, read-only mode, line error markers). Verify: a component test for value and onChange, and `contentSecurityPolicy.http.test.ts` still passes unchanged.
- [ ] 6.2 Add `services/notificationModels.client.ts` and `types/notificationModels.types.ts`, and add MSW handlers. Verify: handler-backed hook tests are added in 6.3 and 6.4.
- [ ] 6.3 Add `NotificationModelsPage.tsx`: a `ListView` with `usePagination`, `RecordCard` rows (name, active badge, visibility, last run status), a New button, and a link to the Library. Register routes in `constants/routes.ts` and `main.tsx`, and add the nav item in `layout/config/navigation.ts`. Verify: a page test at 375px for the list, empty state and navigation.
- [ ] 6.4 Add `NotificationModelDetailPage.tsx` with a `hooks/useNotificationModelForm.ts` adapter on `useFormDraft`, mirroring `useAccountForm`. `/notification-models/new` starts from a commented template script. The `FormView` tabs are:
  - **Form:** fields, endpoint `CopyRow` plus Shortcut setup text and an ingest-key link, a slots table with binding selects over the owner's records, settings, and origin/version with update.
  - **Code:** `CodeEditor` bound to `draft.values.code`, Check calling `validate`, and a `<details>` helper reference from `constants/notificationHelpers.ts`.
  - **Playground:** text area, Run calling `test` with draft code and settings, outcome, preview, error line, stdout, and a "nothing is created" note.
  - **Logs:** a paginated run list with transaction links.

  The record actions menu has Publish (a confirm listing the published fields) and Delete. Verify: `tests/NotificationModelDetailPage.test.tsx` and `hooks/tests/useNotificationModelForm.test.ts` cover:
  - tab navigation with the draft kept;
  - a save error with line;
  - the activation error listing slots;
  - a playground run without saving;
  - the logs list;
  - the publish confirm.
- [ ] 6.5 Add "Notification ingest only" to `pages/Profile/components/CreateApiKeyForm.tsx`, disabling write while it is checked. The key is still shown once through `ApiKeyRevealDialog`. Verify: the `CreateApiKeyForm` test.

## 7. Community library

- [ ] 7.1 Add `services/library.service.ts` with `publish`, `listLibrary`, `getLibraryModel`, `install` and `updateFromSource`. `publish` creates version `max+1` with a snapshot of name, description, code, slots and settings (no bindings) and sets `public`, inside one `$transaction`. Setting `private` is the normal update. The other functions:
  - list public models with ≥1 version, the latest version and the author's public username (no email);
  - show the latest version detail;
  - install: a private, inactive copy with empty bindings and `sourceVersionId`.

  `updateFromSource` implements the merge rules from design §9: 400 listing unbound required slots, the user's name kept, settings merged, and bindings kept for the same key and kind.

  Verify: service tests cover snapshot immutability, bindings never published, the install copy being independent, update-available and `localCodeModified` computation, the merge rules, 400 for missing bindings, and that deleting the original leaves copies working.
- [ ] 7.2 Add the controllers and routes `/notification-library`, `/notification-library/:modelId`, `/notification-library/:modelId/install`, `/notification-models/:id/publish` and `/notification-models/:id/update-from-source`. Verify: the routes test covers publish → install by another user → author publishes v2 → the copy sees an update → applying it with the new binding keeps the copy active; another user cannot publish or update a model that isn't theirs (404).
- [ ] 7.3 Add `NotificationLibraryPage.tsx` (browse, view code read-only, install → navigates to the copy's Form tab). Add the update `ModalDialog` on the Form tab: current and new code side by side read-only, a local-modification warning, and selects for new required slots. Verify: page and dialog tests.

## 8. Docs and acceptance

- [ ] 8.1 Write `docs/NOTIFICATION_MODELS.md`:
  - the architecture decision and when to revisit it;
  - the script contract and helper reference;
  - the sandbox layers and residual network risk;
  - the run lifecycle and statuses;
  - iPhone Shortcut and curl setup examples.

  Also update `docs/DATA_MODEL.md` (the new models), `apps/api/CLAUDE.md` (the `notificationModels/` module with `sandbox/` and the worker), `apps/web/CLAUDE.md` (route table) and root `CLAUDE.md` (the env var table and docs table). Verify: grep finds `NOTIFICATION_RUNNER_CONCURRENCY` in `env.ts`, `.env.example` and `CLAUDE.md`.
- [ ] 8.2 From the repo root, `npm run typecheck`, `npm run lint` and `npm run test` pass, as do the Docker-backed integration suites. Run `openspec validate b007-notification-processor --strict`. Verify: command output is recorded in the PR.
- [ ] 8.3 Staging acceptance on `flowledger-dev` (owner present):
  - create a Plata model, check it, run it in the playground, bind slots and activate;
  - create an ingest key;
  - POST from the real phone path (Shortcut) or curl → exactly one correct transaction;
  - send a duplicate → none;
  - send a promotion → skipped in Logs;
  - deactivate → 404;
  - the malicious snippets from 3.3 fail safely through the playground;
  - restart the API with queued runs → processed;
  - a second account installs the model from the library, binds its own records and ingests successfully.

  Record the outcomes and the confirmed device trigger path in the PR. Verify: a PR comment with the checklist.
- [ ] 8.4 Update `SHORT_TERM_ROADMAP.md` (ST-010, ST-011 and ST-032 statuses; B-007 status) and log any deferred finding in `docs/KNOWN_ISSUES.md`. Verify: the diff touches only those rows and entries.
