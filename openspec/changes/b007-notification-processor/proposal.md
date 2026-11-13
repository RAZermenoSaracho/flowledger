# Proposal

## Why

Users want transactions created automatically from bank notifications, for example when an automation forwards a notification's text, without the sender knowing how to parse it or call the transaction API. FlowLedger has no notification ingestion, no user scripting, no job queue and no sandbox today, so all parsing and transaction logic has to be added server-side, safely, and on top of the existing transaction services. This replaces the narrower regex-rule plan in ST-010/ST-011 with the agreed product vision.

## What Changes

- **Notification models.** A user-owned model holds a Python script, mapping slots (named references to the user's accounts, categories and Groups), user settings, an active flag and private/public visibility. A model is inactive until its code validates and every required slot is bound to one of the owner's records.
- **Constrained-Python scripts.** A script defines `process(text, ctx)` and returns `expense(...)`, `income(...)`, `transfer(...)` or `skip(reason)`. Scripts use a validated Python subset: no imports, no dunder or frame attributes, and a fixed allowlist of builtins and helpers (`re`, `Decimal`, `amount`, `normalize`, `parse_date`). They run in a fresh, killable, permission-restricted sandbox process (CPython on WebAssembly via Pyodide) with time, memory, input and output limits.
- **Per-model ingest endpoint.** `POST /v1/notification-models/:id/notifications` takes JSON `{ "text": ... }` only (1 to 4,000 characters, extra fields rejected) and an API key with the new `ingest` scope. It returns `202 Accepted` with a run id only after the run is persisted. An unknown, foreign or inactive model returns 404. Duplicate deliveries are collapsed.
- **Persistent queue.** Postgres-backed `NotificationRun` rows form a logical queue per model, processed by a separate Node worker process from the same `apps/api` codebase. The HTTP API authenticates, validates and persists ingests, then returns 202; it never claims or executes runs. The processes share only Postgres. The worker polls every 2 s without an API-to-worker signal. Worker unavailability leaves accepted runs queued and never takes the API down. A Serializable database claim caps concurrency across all worker processes globally and per user by `NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL` (default 4) and `NOTIFICATION_PROCESSOR_MAX_CONCURRENT_PER_USER` (default 2); the limits never reject notifications, and invalid values stop startup. Each user may hold 500 queued runs (429 beyond), scheduling is fair across users and models, and runs of one model start in FIFO order. Queued runs survive restarts. There are no automatic retries: a processing run whose worker liveness row is stale for more than 2 minutes is failed as `worker_lost` and never has a transaction. A run is completed if and only if its transaction was created in the same database transaction. Transactions are created only through the existing `createTransaction` service as the model owner.
- **API keys.** A new "ingest only" key type with scope `["ingest"]`. It can call only the ingest route. `read` and `write` keys cannot ingest.
- **Web UI.** A list of models, and a Form View for each model with Form, Code (Python editor with syntax highlighting, validation and a function reference), Playground (side-effect-free test), Queue (read-only pending runs) and Logs (finished runs) tabs, plus a community Library page.
- **Community library.** Publishing snapshots an immutable numbered version. Installing creates an independent, inactive, private copy that the installer must bind to their own records. When a newer version exists, the owner of a copy is offered an optional update. Updates are never automatic, and the owner is warned if local code changed.
- Retention: notification text is cleared 7 days after a run finishes and finished runs are deleted after 30 days; pending runs are never touched. It is automatic, with no user settings.
- **Roadmap.** ST-010 and ST-011 are redefined and ST-032 (community library) is added, all delivered in batch B-007.

## Capabilities

### New Capabilities
- `notification-models`: model CRUD, slots and bindings, activation rules, the script contract, sandbox guarantees and the side-effect-free test.
- `notification-ingestion`: the per-model ingest endpoint, persistent queue and run lifecycle, concurrency and fairness, dedupe, crash recovery, transaction creation, queue and logs reads, and retention.
- `notification-model-library`: publishing versions, browsing, installing copies and optional updates.
- `notification-model-rules`: visual rules derived from the one Python script, with deterministic Form → Code generation, AST-based Code → Form parsing, and non-destructive handling of unsupported code.
- `notification-models-ui`: list, five-tab Form View, code editor, playground, queue, logs and library pages.

### Modified Capabilities
- `personal-api-keys`: adds the ingest-only key type and the `ingest` scope.
- `public-rest-api`: adds the ingest route, the one `/v1` POST that requires `ingest` instead of `write`.

## Impact

- `database/prisma/schema.prisma` and one migration: four tables (`NotificationModel`, `NotificationModelVersion`, `NotificationRun`, `NotificationWorker`) and two enums. Each worker process has one liveness row, touched every 15 s. No existing table changes.
- `apps/api`: a new `modules/notificationModels/` module (routes, controllers, services, sandbox, worker), the `/v1` route, `credential.types.ts`, API-key create service, `src/worker.ts` (new entrypoint built as `dist/worker.js`), `start:worker`/`dev:worker` scripts, the unauthenticated `GET /health/notification-worker` route (200 with `{ workers: n }` for workers seen within 60 s, otherwise 503 with `{ workers: 0 }`); the HTTP entrypoint remains `dist/server.js`, and `env.ts` (`NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL` and `NOTIFICATION_PROCESSOR_MAX_CONCURRENT_PER_USER`), and `createTransaction`, which gains an optional transaction client parameter so completion and creation commit together; this is the only change to existing code paths.
- Tests: queue saturation, concurrency and fairness, persistence and restart, crash recovery, and retention.
- `packages/shared`: notification model, proposal and ingest schemas, and the API-key create schema.
- `apps/web`: `pages/NotificationModels/*`, routes, navigation, API-key create dialog, and a `CodeEditor` component.
- New dependencies:
  - `pyodide` (api, about 10 MB, loaded from `node_modules`, no network at runtime).
  - `codemirror` and `@codemirror/lang-python` (web). Both are CSP-safe.
- Deployment: one new PM2 process from the same build, with no new service, repository, database or worker-specific dependency and no `apps/engine`. Before the first production deploy, the owner runs `pm2 start npm --name flowledger-prod-worker --kill-timeout 15000 --exp-backoff-restart-delay 1000 -- run start:worker` in `~/production/flowledger/apps/api`, then `pm2 save`, and adds `pm2 restart flowledger-prod-worker --update-env` after the API restart in the external `~/scripts/deploy-flowledger-prod.sh`. Order stays migrate → build → API → worker. The worker exits 1 if the schema is not migrated; PM2 restarts it with backoff. Node 24 is already required. Scaling adds more `dist/worker.js` processes; a future Lambda move replaces only the sandbox execution body, with no AWS infrastructure or dependency now.
- Docs: `docs/NOTIFICATION_MODELS.md` (new), `docs/DATA_MODEL.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, `.env.example`, and `docs/KNOWN_ISSUES.md` if anything is deferred.
- Non-goals:
  - Shared expenses created from notifications.
  - MCP tools for models.
  - A generic workflow or automation engine.
  - AWS or Lambda infrastructure.
  - Automatic re-execution of a run, of any kind. Only a claim that loses a serialization race is retried, and that is before execution.
  - Staging through `ProviderImportedTransaction`.
