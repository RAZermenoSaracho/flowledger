# Proposal

## Why

Users want transactions created automatically from bank notifications, for example an iPhone Shortcut that forwards a Plata notification, without the phone knowing how to parse text or call the transaction API. FlowLedger has no notification ingestion, no user scripting, no job queue and no sandbox today, so all parsing and transaction logic has to be added server-side, safely, and on top of the existing transaction services. This replaces the narrower regex-rule plan in ST-010/ST-011 with the agreed product vision.

## What Changes

- **Notification models.** A user-owned model holds a Python script, mapping slots (named references to the user's accounts, categories and Groups), user settings, an active flag and private/public visibility. A model is inactive until its code validates and every required slot is bound to one of the owner's records.
- **Constrained-Python scripts.** A script defines `process(text, ctx)` and returns `expense(...)`, `income(...)`, `transfer(...)` or `skip(reason)`. Scripts use a validated Python subset: no imports, no dunder or frame attributes, and a fixed allowlist of builtins and helpers (`re`, `Decimal`, `amount`, `normalize`, `parse_date`). They run in a fresh, killable, permission-restricted sandbox process (CPython on WebAssembly via Pyodide) with time, memory, input and output limits.
- **Per-model ingest endpoint.** `POST /v1/notification-models/:id/notifications` takes plain text or `{ "text": ... }` and an API key with the new `ingest` scope. It returns `202 Accepted` with a run id. An unknown, foreign or inactive model returns 404. Duplicate deliveries are collapsed.
- **Async processing.** Postgres-backed `NotificationRun` jobs are processed in `apps/api` by an in-process worker with configurable concurrency, crash recovery, graceful shutdown and at-most-once transaction creation. Transactions are created only through the existing `createTransaction` service as the model owner.
- **API keys.** A new "ingest only" key type with scope `["ingest"]`. It can call only the ingest route. `read` and `write` keys cannot ingest.
- **Web UI.** A list of models, and a Form View for each model with Form, Code (Python editor with syntax highlighting, validation and a function reference), Playground (side-effect-free test) and Logs tabs, plus a community Library page.
- **Community library.** Publishing snapshots an immutable numbered version. Installing creates an independent, inactive, private copy that the installer must bind to their own records. When a newer version exists, the owner of a copy is offered an optional update. Updates are never automatic, and the owner is warned if local code changed.
- Retention: notification text is kept for 7 days for the Logs tab and then cleared.
- **Roadmap.** ST-010 and ST-011 are redefined and ST-032 (community library) is added, all delivered in batch B-007.

## Capabilities

### New Capabilities
- `notification-models`: model CRUD, slots and bindings, activation rules, the script contract, sandbox guarantees and the side-effect-free test.
- `notification-ingestion`: the per-model ingest endpoint, async run lifecycle, dedupe, retries, transaction creation and run logs with retention.
- `notification-model-library`: publishing versions, browsing, installing copies and optional updates.
- `notification-models-ui`: list, four-tab Form View, code editor, playground, logs and library pages.

### Modified Capabilities
- `personal-api-keys`: adds the ingest-only key type and the `ingest` scope.
- `public-rest-api`: adds the ingest route, the one `/v1` POST that requires `ingest` instead of `write`.

## Impact

- `database/prisma/schema.prisma` and one migration: `NotificationModel`, `NotificationModelVersion`, `NotificationRun`, and two enums. No existing table changes.
- `apps/api`: a new `modules/notificationModels/` module (routes, controllers, services, sandbox, worker), the `/v1` route, `credential.types.ts`, API-key create service, `server.ts` (start and stop the worker), and `env.ts` (`NOTIFICATION_RUNNER_CONCURRENCY`).
- `packages/shared`: notification model, proposal and ingest schemas, and the API-key create schema.
- `apps/web`: `pages/NotificationModels/*`, routes, navigation, API-key create dialog, and a `CodeEditor` component.
- New dependencies:
  - `pyodide` (api, about 10 MB, loaded from `node_modules`, no network at runtime).
  - `codemirror` and `@codemirror/lang-python` (web). Both are CSP-safe.
- Deployment: no new process, service or host package. The external deploy script is unchanged. Node 24 is already required.
- Docs: `docs/NOTIFICATION_MODELS.md` (new), `docs/DATA_MODEL.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, `.env.example`, and `docs/KNOWN_ISSUES.md` if anything is deferred.
- Non-goals:
  - Shared expenses created from notifications.
  - MCP tools for models.
  - A generic workflow or automation engine.
  - AWS or Lambda infrastructure.
  - Retries of scripts that fail deterministically.
  - Staging through `ProviderImportedTransaction`.
