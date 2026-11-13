# Design

## Context

See proposal.md, Why. Facts verified in the repository on 2026-11-13 at `370098a`:

**What exists today**
- No notification ingestion, rule, regex or script code. The `Notification` model holds in-app notifications only.
- No queue, job table, Redis or locking dependency. The only background job is `SyncfyAutoSyncScheduler`: a `setInterval` with an in-process guard, started and stopped in `apps/api/src/server.ts`. Shutdown does not await in-flight work.
- No Python anywhere in the product.

**Deployment**
- One API process, bound to `127.0.0.1` behind an edge proxy.
- Deployed by `.github/workflows/deploy-prod.yml` on a self-hosted runner, which calls `~/scripts/deploy-flowledger-prod.sh`. The script is outside the repo; it runs `prisma migrate deploy`, then the build, then `pm2 restart` of `flowledger-prod-api` and `flowledger-prod-web`. PM2 (verified) runs the API as `npm start` in `apps/api`, and is resurrected at boot.
- Node 24.

**Transactions**
- `createTransaction(userId, body: TransactionInput)` (`modules/transactions/services/create.service.ts:27`) takes a plain `userId`, already has a non-HTTP caller (MCP tools), and runs inside its own `prisma.$transaction`.
- `transactionSchema` requires `name`, `amount` (decimal string), `type` (`income | expense | transfer`) and `date` (ISO with offset, or `YYYY-MM-DD`). Currency falls back from `executionCurrency` to the account's, then the user's.
- A transfer is one row, `accountId` → `transferToAccountId`, with no category, Group or offset.
- Ownership of accounts, categories and Groups is enforced in `transactionValidation.service.ts`.

**API keys**
- Hashed `fl_` keys. `scopes` is a `String[]` holding `read`/`write`.
- `requireCredential` and `requireScope` live in `middleware/credential.ts`.
- `/v1` is a deny-by-default allowlist with a 120/min limiter and an audit line on each write.
- morgan never logs bodies or headers.
- `express.json` is global with a 1 MB limit.

**Web**
- `FormView` (tabs via `?tab=`, only the active tab is mounted), `useFormDraft`, `EditableField`, `RelatedList`, `ListView` with `usePagination`, `CopyButton`/`CopyRow`.
- No code-editor dependency.
- The enforced CSP has no `'unsafe-eval'` and no `'wasm-unsafe-eval'`, so Python cannot run in the browser.

## Goals / Non-Goals

**Goals:**
- Untrusted user Python never runs in the API process. It cannot read files, environment, credentials or other users' data, and cannot outlive its limits.
- Accepted notifications are acknowledged quickly and processed concurrently, and survive restarts.
- Each accepted notification creates at most one transaction, and a run is `completed` exactly when its transaction was created, in the same database transaction.
- Transaction rules stay in the existing service.

**Non-Goals:**
- A general automation or workflow engine, plugin system, or script access to the network or database.
- Automatic retry of a run whose worker crashed. Such a run is failed terminally; see Decision 6.
- Running Python in the browser.

## Decisions

### 1. Architecture: `apps/api` code run as two processes (HTTP API and notification worker), untrusted code in sandbox children, not `apps/engine`

| | A: `apps/api` module with a separate worker process (`dist/worker.js`) + sandbox child processes (chosen) | B: separate `apps/engine` | C: shared packages + separate worker app |
|---|---|---|---|
| Isolation of untrusted Python | Same in every option: a separate sandbox process | Same | Same |
| Load on API traffic | None: claiming, execution and creation run in the worker process. The API only persists rows | Fully separate | Fully separate |
| Operations | One more PM2 process from the same build, plus one restart line in the existing deploy script (§12) | New process in an external script that the repo cannot see, plus env, restart and monitoring | Same as B, plus a new package build step |
| Database and auth boundary | Calls `createTransaction(ownerId, …)` directly, like MCP does | Either imports api services across apps (a second api entrypoint in disguise) or calls the API over HTTP, which needs a privileged service credential | Requires moving transaction services into a package, a large refactor |
| Lambda path | Swap the body of `runScript()` for a Lambda invoke | Same | Same |
| Testing | Existing vitest, supertest and testcontainers setup | New workspace setup | New workspace and package setup |

The expensive and dangerous part, Python execution, is isolated in all three options. B and C only move the cheap orchestration, and they cost a new deployable, cross-app imports or a privileged credential.

**Two processes, one codebase.** The worker is a second entrypoint of `apps/api` (§12), so it reuses the Prisma schema, services, validation, env conventions and `createTransaction` without cross-app imports or a privileged credential. Revisit a separate app only if the worker needs a different runtime or deploy cadence.

The proposal contract is the only shared piece (Option C's real benefit). It goes in `packages/shared`.

### 2. Python: a validated subset on real CPython (Pyodide) in a restricted child process

Full Python, guarded only by a static checker, is not a security boundary. A subset interpreter (Starlark-like) would mean a non-Python dialect or a native dependency. The chosen approach is three layers, each sufficient against its own class of attack:

1. **AST allowlist** (Python `ast` inside the sandbox, run before execution and on save). It rejects:
   - `Import`/`ImportFrom`, `ClassDef`, `Global`/`Nonlocal`, `With`, `async`, `await`, `yield` and generator expressions, decorators and `match`.
   - Any name or attribute starting with `_`.
   - Attributes matching `^(gi|cr|ag|f|tb|co)_` or exactly `format`, `format_map` or `mro`. These block frame traversal and `str.format` attribute traversal.
   - Code over 20,000 characters.

   Errors carry line and column.
2. **Restricted namespace.** `__builtins__` is replaced by an explicit allowlist:
   - Types and conversions: `abs all any bool dict enumerate float int isinstance len list max min range reversed round set sorted str sum tuple zip`.
   - Exceptions: `Exception ValueError`.
   - `print`, captured to 4 KB.
   - The helpers in Decision 3.

   `re` is a namespace exposing only `search match fullmatch findall finditer sub split compile escape` and the flags `I IGNORECASE M MULTILINE S DOTALL`. It is not the module, because `re.enum` leads to `sys`. After the bootstrap, `js`, `pyodide`, `pyodide_js` and `_pyodide` are deleted from `sys.modules`, and `globalThis.fetch` and `WebSocket` are deleted in the child.
3. **Process isolation.** Each execution runs in a fresh child:

   ```
   node --permission --allow-fs-read=<pyodide dir>,<sandbox dir> --max-old-space-size=128 sandboxChild.mjs
   ```

   - The child gets an empty `env` and runs no shell.
   - It talks to the parent only through one JSON line on stdin and one on stdout.
   - Node's permission model denies file writes, `child_process`, workers and native addons.
   - The parent `SIGKILL`s the child on timeout (2 s of script time after the ready signal, 15 s total lifetime), on stdout over 64 KB, or on resident memory over 256 MB.
   - One process per execution means no state carries over between users or runs.

**Residual risk.** Node 24's permission model does not restrict outbound network. Reaching the network would need a full Python-to-WebAssembly-to-JS escape past layers 1 and 2. The risk is accepted and documented, and the Lambda move would close it with an egress-less function.

**ReDoS and resource exhaustion.** Catastrophic backtracking or `"a" * 10**9` hits the timeout or the memory kill, and the run fails with `timeout` or `resource_limit`. Input text is capped at 4,000 characters.

**Runtime checks (first runner task, no separate gate).** The runner's test suite proves on Node 24 that:
- `--permission` with `--allow-fs-read` loads Pyodide;
- the memory kill works, using the V8 WebAssembly max-memory-pages flag or, failing that, the parent sampling the child's RSS every 100 ms (`ps -o rss=`).

Cold start (about 1–2 s) is accepted because processing is asynchronous; there is no pre-warm pool. Concurrency is runtime configuration (Decision 5), not something the tests determine.

### 3. Script contract

```python
def process(text, ctx):
    # ctx.received_at: ISO-8601 string (server receive time, UTC)
    # ctx.settings:    dict[str, str]   (the model's user settings)
    ...
    return expense(amount="1234.50", name="OXXO", account="card", category="food")
```

| Helper | Returns |
|---|---|
| `expense(amount, name, account=None, category=None, group=None, date=None, currency=None, notes=None)` | expense proposal |
| `income(...)` | the same signature as `expense`, as an income proposal |
| `transfer(amount, name, account, to_account, date=None, currency=None, destination_amount=None, notes=None)` | transfer proposal |
| `skip(reason)` | deliberate skip (≤200 chars) |
| `amount(s, decimal=".", thousands=",")` | normalized decimal string, e.g. `"$1,234.50"` → `"1234.50"`; raises `ValueError` if none found |
| `normalize(s)` | lowercase, accents stripped, whitespace collapsed |
| `parse_date(s, fmt)` | ISO date or datetime string via `strptime` |
| `Decimal` | `decimal.Decimal` |

The script's outcome is decided as follows:
- Returning `None` is a skip with reason `no result`.
- An uncaught exception is a `failed` run with the exception type, message and line number.
- Any other return value fails with `invalid result`.

**Slot references.** `account`, `to_account`, `category` and `group` are **slot keys**, not record ids. The script never sees ids. Amounts must be strings, and a float is rejected as `invalid result`.

The sandbox returns
```json
{ "kind": "proposal", "proposal": {...} }
```
or `skip` or `error`, together with `stdout`. The API validates it with `notificationProposalSchema` (shared).

### 4. Proposal → transaction

The worker turns a valid proposal into a transaction input:
1. Maps each slot key to the model's binding.
2. Builds the `TransactionInput`:

| `TransactionInput` field | Source |
|---|---|
| `name` | `name` |
| `amount` | `amount` |
| `type` | the proposal kind |
| `date` | `date` if present, else `receivedAt` |
| `executionCurrency` | `currency` |
| `accountId`, `transferToAccountId`, `categoryId`, `groupId` | the bound slots |
| `destinationAmount` | `destination_amount` |
| `notes` | `notes` |

3. Parses it with the shared `transactionSchema`.
4. Calls `createTransaction(model.userId, input)`.

`createTransaction` owns every business rule: ownership, archived records, transfer constraints and currency fallback. Its 400 errors become a `failed` run with the message. A slot key that is unknown or unbound fails with `mapping_missing:<key>`.

**Example (Plata purchase).** The notification text:

> `Compraste $1,234.50 MXN en OXXO con tu tarjeta terminación 1234`

The script:

```python
def process(text, ctx):
    t = normalize(text)
    if "aprovecha" in t or "promocion" in t:
        return skip("promotion")
    m = re.search(r"compraste \$([\d,]+\.\d{2}) (\w{3}) en (.+?) con tu tarjeta", t)
    if not m:
        return skip("not a purchase")
    return expense(amount=amount(m.group(1)), currency=m.group(2).upper(),
                   name=m.group(3).upper(), account="card", category="general")
```

The resulting transaction input. `date` is `receivedAt`; `card` is bound to the user's Plata account and `general` to their category.

```json
{ "name": "OXXO", "amount": "1234.50", "type": "expense",
  "date": "2026-11-13T18:04:11.000Z", "executionCurrency": "MXN",
  "accountId": "<bound card>", "categoryId": "<bound general>" }
```

**Other examples:**

| Input | Outcome |
|---|---|
| `Recibiste $2,000.00 de Juan Pérez` | `income(amount="2000.00", name="Juan Pérez", account="card")` |
| `Transferiste $500.00 a tu cuenta de ahorro` | `transfer(amount="500.00", name="Ahorro", account="card", to_account="savings")` |
| `¡Aprovecha 10% de cashback!` | `skipped` / `promotion` |
| `Compraste $abc` | `skipped` / `not a purchase`. If the script instead called `amount()` on it, `failed` / `ValueError: no amount found (line 7)` |

### 5. Persistent queue, concurrency limits and fair scheduling

**One shared table, one logical queue per model.** Every accepted notification is a `NotificationRun` row carrying its `modelId` and `userId`. A model's queue is its rows with status `queued` or `processing`. There are no per-model tables, workers or processes, and no broker.

**Ingest** (`POST /v1/notification-models/:id/notifications`). The route checks, in order:
1. The `ingest` scope.
2. The existing `/v1` per-credential limiter (120/min). No extra limiter is added.
3. The model exists, belongs to the key owner and is active. Otherwise 404.
4. The JSON body `{ "text": string }`, 1 to 4,000 characters, with no other fields. Otherwise 400.
5. **Queue capacity:** the owner has fewer than 500 `queued` runs across all models. Otherwise 429 with `Retry-After: 60`.
   `// ponytail: count-then-insert soft cap; concurrent requests can overshoot by a few rows, which is harmless for a backpressure cap.`

It then inserts `NotificationRun(status=queued, text, userId, modelId, dedupeKey)` and returns `202 { runId, status: "queued", duplicate: false }` **only after the insert commits**. Any database error returns 503 and nothing is acknowledged. After the response, the API does nothing else: the worker process finds the run by polling.

**Dedupe.** The dedupe key is:
- the optional `Idempotency-Key` header (≤128 characters), when present;
- otherwise `sha256(text) + ":" + floor(receivedAt / 10 min)`.

The constraint `@@unique([modelId, dedupeKey])` enforces it. A conflict returns `202` with the existing run and `duplicate: true`.
`// ponytail: fixed 10-min bucket; a retry straddling a boundary is accepted twice — sliding-window lookup if it shows up in logs.`

**Configuration** (`config/env.ts`, validated at startup):

| Variable | Default | Allowed | Meaning |
|---|---|---|---|
| `NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL` | `4` | integer 1–64 | max runs in `processing` across all API instances |
| `NOTIFICATION_PROCESSOR_MAX_CONCURRENT_PER_USER` | `2` | integer 1–64, ≤ global | max runs in `processing` for one user |

A non-integer, out-of-range or per-user-above-global value fails Zod env validation, and the API refuses to start with a message naming the variable, like every other env var.

The limits count only queued-notification executions. The playground runs outside the queue, under a fixed cap of 2 concurrent tests per API process and 1 per user, and returns 503 when busy. Neither limit touches how many notifications are accepted; capacity is the 500-per-user rule.

**Atomic claiming across instances.** A claim is one Prisma interactive transaction at `isolationLevel: Serializable`. It needs no raw SQL.
1. `groupBy` `processing` runs by `userId` and by `modelId`. If the total is ≥ global, stop.
2. `groupBy` `queued` runs by `(userId, modelId)` with `_min(receivedAt)`, the head of each model queue. Users already at the per-user limit are dropped.
3. Pick the model queue sorted by:
   - the user's processing count, ascending;
   - the model's processing count, ascending;
   - the head's `receivedAt`, ascending.
4. Take that model's oldest `queued` run (`receivedAt`, then `id`). Update it to `processing` with `workerId` (random per process start) and `startedAt`, guarded by `where: { id, status: "queued" }`.

Postgres serializable isolation aborts one of two concurrent claims that would together exceed a limit or take the same row. The aborted claim (Prisma `P2034`) is retried up to 3 times, then left for the next tick. A worker claims one run per transaction and loops while it gets one. It never holds more than the global limit in flight, so memory is bounded by the limit, never by backlog size.

**Fairness.** The sort makes a user with nothing running win over a user with a backlog. A per-user limit below the global one guarantees other users capacity. The same rule applied to models stops one flooding model from blocking its owner's other models. No user or model can be starved while it has queued runs.

**FIFO.** Each model's runs start in arrival order. Up to the per-user limit, runs of the same model may execute at the same time, so completion order is not guaranteed. This is harmless because each transaction's `date` defaults to its own `receivedAt`.
`// ponytail: start-order FIFO only; one-at-a-time per model if strict completion order is ever required.`

**Worker** (`notificationRunWorker.ts`, started and stopped only by the worker process `src/worker.ts`, §12):
- It polls for claims every 2 s. This is a cheap indexed `groupBy` and needs no API-to-worker signal.
- Every 15 s it touches its `NotificationWorker` row.
- Every minute it runs recovery and retention (Decision 6).

`// ponytail: 2 s polling; LISTEN/NOTIFY (raw SQL + pg dependency) only if ingest-to-start latency ever matters.`

Each claimed run:
1. Reloads the model. If the model is inactive, the run becomes `skipped` / `model_inactive`, which covers deactivation while queued.
2. Runs the sandbox.
3. Outcomes:
   - A `skip` result makes the run `skipped`.
   - A script or validation error makes it `failed`.
   - A proposal is mapped (Decision 4). Then one `prisma.$transaction` re-checks that the model is still active (otherwise the run is `skipped` / `model_inactive` and nothing is created), calls `createTransaction(userId, input, tx)` and updates the run to `completed` with `transactionId`. The update is guarded by `where: { id, status: "processing", workerId }`; a count of 0 throws, which rolls back the transaction too.

**`createTransaction` takes an optional `tx`.** When it is given, the service runs on that client instead of opening its own `$transaction`. This is a small change to the existing service and preserves every existing caller. It gives the invariant: **a run is `completed` if and only if its transaction was created in the same database transaction (if the user later deletes that transaction, the run keeps `completed` with an empty link).**

### 6. Job lifecycle, crash recovery, shutdown, retention

```
queued ──claim──▶ processing ──▶ completed   (transaction created, same DB transaction)
   │                  ├────────▶ skipped     (script skip, model_inactive)
   │                  └────────▶ failed      (script error, timeout, resource_limit, invalid result,
   │                                          mapping_missing, validation error, worker_lost)
   └─(graceful shutdown before create)◀─ processing
```

**A. Never started.** A `queued` run is a durable row. It survives restarts and crashes, and is claimed when capacity allows. Nothing deletes it except the owner deleting the model.

**B. Claimed or executing when its worker crashed.** It is never re-executed automatically. Recovery runs every minute in every worker. It sets `processing` runs whose `workerId` has no `NotificationWorker` row seen within 2 minutes to `failed` / `worker_lost`, with `finishedAt`. A live worker touches its row every 15 s, and the sandbox's hard lifetime is 15 s, so a 2-minute-stale row reliably means the process is gone.

Because creation and `completed` commit together, a `worker_lost` run **never** has a transaction. A worker that was presumed dead but finishes late fails its guarded update, and its transaction rolls back. Logs show the reason as "processing was interrupted; no transaction was created". Retrying would mean sending the notification again: a new text bucket or `Idempotency-Key`, and a new run.

**Graceful shutdown of the worker process** (`SIGTERM`/`SIGINT` in `src/worker.ts`, awaited before `prisma.$disconnect()`; PM2 `--kill-timeout 15000`). The API's own shutdown is unchanged.
1. Stop claiming.
2. Let runs in the create step finish, since that is one short DB transaction.
3. Kill sandbox children still executing and return their runs to `queued` (`where: { id, status: "processing", workerId }`). This is certain to be safe: no create step has started, so there is no side effect.
4. Wait at most 10 s overall. Anything still unfinished is left `processing` and handled by rule B.
5. Delete its `NotificationWorker` row.

**Retention** (the minute tick, any instance, idempotent `updateMany`/`deleteMany` filtered on terminal status and `finishedAt`):
- `text` is set to null on `completed`, `skipped` and `failed` runs with `finishedAt` older than 7 days.
- Those runs are deleted once `finishedAt` is older than 30 days. Deleting a run never touches its transaction.
- `queued` and `processing` runs are never matched by either rule (`finishedAt` is null), however old they are.
- Between day 7 and day 30 a run keeps only non-sensitive metadata: status, reason, timestamps and transaction link. The retention periods are constants, with no user-facing settings.

### 7. Data model

```prisma
enum NotificationModelVisibility { private public }
enum NotificationRunStatus { queued processing completed skipped failed }

model NotificationModel {
  id              String   @id @default(cuid())
  userId          String
  name            String
  description     String?
  code            String
  isActive        Boolean  @default(false)
  visibility      NotificationModelVisibility @default(private)
  slots           Json     @default("[]")  // [{ key, kind: account|category|group, label, required }]
  bindings        Json     @default("{}")  // { [slotKey]: recordId } — never published
  settings        Json     @default("{}")  // { [key]: string } — values published as defaults
  sourceVersionId String?                  // version this copy was installed/updated from
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  sourceVersion   NotificationModelVersion? @relation("InstalledFrom", fields: [sourceVersionId], references: [id], onDelete: SetNull)
  versions        NotificationModelVersion[] @relation("PublishedVersions")
  runs            NotificationRun[]
  @@index([userId])
  @@index([visibility])
}

model NotificationModelVersion {
  id          String   @id @default(cuid())
  modelId     String
  version     Int
  name        String
  description String?
  code        String
  slots       Json
  settings    Json
  createdAt   DateTime @default(now())
  model       NotificationModel   @relation("PublishedVersions", fields: [modelId], references: [id], onDelete: Cascade)
  installs    NotificationModel[] @relation("InstalledFrom")
  @@unique([modelId, version])
}

model NotificationRun {
  id            String   @id @default(cuid())
  modelId       String
  userId        String                // owner, copied from the model at ingest: per-user limits and fairness
  status        NotificationRunStatus @default(queued)
  dedupeKey     String
  text          String?               // cleared 7 days after finishedAt
  proposal      Json?
  reason        String?               // skip reason or error (≤500 chars, never contains credentials)
  workerId      String?               // claiming process
  transactionId String?  @unique
  receivedAt    DateTime @default(now())
  startedAt     DateTime?
  finishedAt    DateTime?
  model         NotificationModel @relation(fields: [modelId], references: [id], onDelete: Cascade)
  transaction   Transaction?      @relation(fields: [transactionId], references: [id], onDelete: SetNull)
  @@unique([modelId, dedupeKey])
  @@index([status, userId])
  @@index([modelId, status, receivedAt])
  @@index([status, finishedAt])
}

model NotificationWorker {
  id         String   @id              // workerId, random per worker process start
  hostname   String
  pid        Int
  startedAt  DateTime @default(now())
  lastSeenAt DateTime @default(now())
  @@index([lastSeenAt])
}
```

`slots`, `bindings` and `settings` are JSON because they are small, model-local and validated by shared Zod schemas on every write. No query filters inside them. Bindings are checked against the owner's records on every save, at activation, and again by `createTransaction` at run time.

Only back-relation fields are added to `User` and `Transaction`, and no existing column changes.

### 8. Web API (JWT, `/notification-models`)

**Routes**

| Route | Purpose |
|---|---|
| `GET /notification-models` | list, datasieve query, paginated |
| `POST /notification-models` | create |
| `GET /notification-models/:id` | read, includes `endpointPath` and `update` info |
| `PUT /notification-models/:id` | partial update |
| `DELETE /notification-models/:id` | delete |
| `POST /notification-models/validate` | `{ code }` → `{ errors: [{ line, col, message }] }` |
| `POST /notification-models/:id/test` | `{ text, code?, settings? }`, then the result |
| `GET /notification-models/:id/queue` | the model's `queued` and `processing` runs, oldest first, paginated |
| `GET /notification-models/:id/logs` | the model's terminal runs, newest first, paginated |
| `POST /notification-models/:id/publish` | create the next version |
| `POST /notification-models/:id/update-from-source` | `{ versionId, bindings? }` |
| `GET /notification-library` | public models with a published version, plus author `@username` |
| `GET /notification-library/:modelId` | latest version detail, including code |
| `POST /notification-library/:modelId/install` | create a copy |

**Test result.** `POST /notification-models/:id/test` returns:
```
{ outcome: "proposal" | "skip" | "error", proposal?, transactionPreview?, reason?, error?: { message, line? }, stdout }
```
`transactionPreview` resolves slot keys to record names. The endpoint never writes.

**Write rules**
- Saving rejects code that fails validation (400 with line errors).
- Activation (`isActive: true`) requires every required slot bound to an owned, non-archived record. Otherwise 400 listing the unbound slots.
- Changing `slots` or `bindings` on an active model re-runs the activation check.
- All lookups are scoped `{ id, userId }`, and anything else is `notFound()`.

### 9. Library and versions

**Publish** sets `visibility = public` and creates version `max + 1`, snapshotting name, description, code, slots and settings. It never snapshots bindings. The UI lists exactly what is published before confirming.
- Setting `private` hides the model from the library. Existing copies keep working.
- Deleting the original cascades its versions. Copies keep their code and lose update tracking (`sourceVersionId` becomes null).

**Install** creates a private, inactive copy owned by the caller: latest version's code, slots and settings, `bindings = {}`, with `sourceVersionId` set. The copy has its own id, so its own endpoint, runs and state.

**Update available** when the source model is public and has a version greater than the installed one. `localCodeModified` is `code !== sourceVersion.code`, comparing against the stored version row with no extra column.

**Update from source** applies the chosen version:
- **Code, description, slots:** taken from the new version.
- **Name:** keeps the user's name.
- **Settings:** keeps the user's values for keys that still exist, adds new keys with their defaults, and drops removed keys.
- **Bindings:** kept where the slot's key and kind are unchanged. Required slots without a binding must be supplied in `bindings`, or the request fails with 400 listing them. The model therefore never silently becomes unrunnable.
- **Tracking:** sets `sourceVersionId`.

Declining an update is doing nothing, and the copy stays usable.

### 10. Web UI

**Module.** `pages/NotificationModels/` with:
- `NotificationModelsPage` (`ListView`, mirrors `AccountsPage`);
- `NotificationModelDetailPage` (`FormView`, mirrors `AccountDetailPage` and `useAccountForm`);
- `NotificationLibraryPage`;
- the client `services/notificationModels.client.ts`.

**Tabs**
- **Form:**
  - name, description, active toggle and visibility, as `EditableField`s;
  - an endpoint `CopyRow` with the full URL, plus a request example (header `Authorization: Bearer <ingest key>`, JSON body `{"text": "…"}`) and a link to create an ingest key;
  - a slots table (key, kind, label, required) and binding selects over the owner's records;
  - a settings key/value list;
  - origin and version, with an "Update available" action that opens a `ModalDialog`. The dialog shows current and new code side by side, read-only, warns when `localCodeModified`, and offers binding selects for new required slots.
- **Code:** a `CodeEditor` (CodeMirror 6 with `lang-python`, no workers or eval, CSP-safe) bound to `draft.values.code`. A Check button calls `validate` and shows errors by line. A collapsible `<details>` reference lists each helper with signature, description and example, from a constants file.
- **Playground:** a text area and a Run button calling `test` with the current draft code and settings. It shows the outcome, the transaction preview, the reason or error with line, and stdout. It states that nothing is created.
- **Queue** (read-only): the model's `queued` and `processing` runs from `/queue` with `usePagination`. It shows status, position (offset + index + 1 among queued, since rows come oldest first), received time, waiting time (`now − receivedAt`), started time for processing runs, and the first 80 characters of text. There are no cancel, retry, reorder, delete, start/stop or concurrency controls.
- **Logs** (read-only): terminal runs from `/logs` with `usePagination`. It shows received and finished time, status badge (completed, skipped or failed), reason, transaction link, and text while retained (7 days).

**New models** start at `/notification-models/new` from a commented template script.

**Navigation and keys.** A nav item "Notification models" is added. The API-key create dialog gains "Notification ingest only".

### 11. API keys and `/v1`

- `createApiKeySchema` gains `ingestOnly: boolean` (default false). Combining it with `allowWrite: true` is a 400.
- An ingest-only key stores `["ingest"]`, and `CredentialScope` becomes `"read" | "write" | "ingest"`.
- `requireScope` is unchanged: `ingest` implies nothing and nothing implies `ingest`. An ingest key gets 403 on every other `/v1` route.
- OAuth grants cannot request `ingest`.
- The ingest route uses `auditV1Write("notification.ingest")` and never logs text.
- The body is JSON `{ "text": string }` only, parsed by the existing global `express.json`, with `.strict()` validation. Callers send nothing else: no app id, title, type, amount or ids.

### 12. Worker process, deployment and operations

**Entry points** (both in `apps/api`, both built by the existing `tsc` build, both bootstrap-only and excluded from coverage like `server.ts`):

| Process | Entry point | Responsibility |
|---|---|---|
| HTTP API | `src/server.ts` → `dist/server.js` (unchanged) | Auth, model management, validation, persisting ingests, `202`, `/health`, `/health/notification-worker`. **Never claims or executes runs.** |
| Notification worker | `src/worker.ts` → `dist/worker.js` (new) | Schema readiness check, then `notificationRunWorker.start()`. Handles `SIGTERM`/`SIGINT` with `await worker.stop()`, `prisma.$disconnect()`, then `exit(0)`. Has no HTTP listener. |

Both processes import the same `env`, the Prisma singleton, services and sandbox. Each validates its own environment at startup. A worker failure, crash or restart cannot affect the API process: the only thing they share is Postgres, and accepted runs are rows.

**Scripts.** In `apps/api/package.json`:
- `"start:worker": "node dist/worker.js"`
- `"dev:worker": "tsx watch src/worker.ts"`

The root `dev` and `start` scripts add the worker to their existing `npm-run-all --parallel` lists, so local development runs all three processes.

**Worker liveness.** The `NotificationWorker` table holds one row per running process: `id` = `workerId`, `hostname`, `pid`, `startedAt`, `lastSeenAt`.
- The worker inserts its row at start and touches `lastSeenAt` every 15 s.
- It deletes its row on graceful stop.
- Recovery uses this one heartbeat (Decision 6): a `processing` run whose `workerId` has no row seen within 2 minutes is lost. Rows not seen for 1 hour are deleted by the minute tick.
- **Health check:** `GET /health/notification-worker` on the API returns `200 { workers: n }` when at least one worker was seen within 60 s, and `503 { workers: 0 }` otherwise. It is unauthenticated, like `/health`, and exposes only that count. It can be polled by an uptime monitor or checked after deploy.

**Migration safety.** Before starting, `worker.ts` probes the schema with `prisma.notificationRun.findFirst({ select: { id: true } })` and `prisma.notificationWorker.count()`. If a table is missing (Prisma `P2021`/`P2022`), it logs `notification worker: schema not migrated` and exits with code 1, and PM2 restarts it with backoff. A worker can therefore never claim against an unmigrated database. For later migrations, the deploy order below guarantees it.

**Deployment (production, PM2 on the existing host, verified).** `deploy-prod.yml` runs `~/scripts/deploy-flowledger-prod.sh`, which lives outside this repo. The script:
1. pulls the code;
2. runs `npm install`;
3. runs `pg_dump`;
4. runs `prisma migrate deploy`;
5. runs `prisma:generate` and `npm run build`;
6. runs `pm2 restart flowledger-prod-api` and `flowledger-prod-web`;
7. runs `pm2 save`.

The owner makes two manual changes, recorded as a task because the script is not in the repo:
- **One-time registration**, from `~/production/flowledger/apps/api`:

  ```
  pm2 start npm --name flowledger-prod-worker --kill-timeout 15000 --exp-backoff-restart-delay 1000 -- run start:worker
  pm2 save
  ```

  This is the same `npm`-in-`apps/api` convention as `flowledger-prod-api`. The 15 s kill timeout exceeds the worker's 10 s graceful stop.
- **Deploy script:** add `pm2 restart flowledger-prod-worker --update-env` immediately after `pm2 restart flowledger-prod-api`, before `pm2 save`.

The resulting order is migrate → build → API → worker. The API restarting first means ingestion resumes immediately while the worker is still draining.

**Operations**
- Each process is started, stopped and restarted independently: `pm2 restart|stop flowledger-prod-worker`.
- `pm2 status` and `pm2 logs flowledger-prod-worker` cover monitoring.
- Stopping the worker only pauses processing: ingests keep returning `202` and the Queue tab shows the backlog.
- Staging (`flowledger-dev`) has no deploy script in the repo or on the host. It uses the same two PM2 commands with its own process name.

**Scaling and Lambda.** More workers are more `dist/worker.js` processes, on this host or another one with the same `DATABASE_URL`. The Serializable claim and the global and per-user limits already hold across all of them. Replacing the execution layer with Lambda means changing the body of `runScript()` (sandbox child → function invoke). The queue, claim and recovery logic stay the same. No AWS code or dependency is added now.

## Risks / Trade-offs

- **[Sandbox escape to network]** Node 24 does not restrict net. → Three layers; the malicious-script test suite gates merge; the risk is documented; Lambda without egress is the upgrade.
- **[Pyodide cold start ~1–2 s and ~100 MB per child]** → Global concurrency defaults to 4 and is tuned by env var to the host's memory. Processing is asynchronous, so the cold start is not user-visible.
- **[After a crash, lost runs hold slots for up to 2 minutes]** The dead worker's `processing` runs count against the limits until its `NotificationWorker` row goes stale. → Queued runs are only delayed, never lost. A short stale window would risk failing live runs.
- **[Serializable claim contention]** With several workers at once, some claims abort and retry. → Claims are one row each and the retry is bounded; throughput at personal-finance volume is far below the contention point.
  `// ponytail: Serializable groupBy claim; SKIP LOCKED raw SQL (needs approval) if claim latency ever matters.`
- **[A worker crash fails its in-flight runs (`worker_lost`) instead of retrying them]** → This is deliberate: there is never a duplicate or an uncertain transaction, the failure is visible in Logs, and queued runs are unaffected. The sender can resend.
- **[Published code is unreviewed]** → Copies install inactive and private, the code is shown before install, and it runs only against the installer's own bound records in the same sandbox.
- **[Published settings may contain personal text]** → The publish confirm lists every published field. Bindings are never published.
- **[In-memory rate limiter per process]** → Acceptable with one instance, as for the rest of `/v1`.

## Migration Plan

1. Run one additive Prisma migration (four tables, two enums). The only change to existing code paths is `createTransaction`'s optional `tx` parameter. No backfill. Rollback is dropping them.
2. Ship in the B-007 PR to `razs_ai`. The `pyodide` package is installed by the deploy script's `npm install`. Before the first production deploy that contains this change, the owner registers `flowledger-prod-worker` in PM2 and adds its restart line to the deploy script (§12). Deploying without registering it is safe: ingests are accepted and queued until the worker starts.
3. Staging acceptance on `flowledger-dev`:
   - create, test, activate;
   - an ingest key;
   - an authenticated POST of `{ "text": … }` creates a transaction;
   - a duplicate is collapsed;
   - a promotion is skipped;
   - the malicious-script suite fails safely;
   - a backlog beyond the concurrency limits drains with the limits respected;
   - stopping the worker leaves the API serving and ingests queuing, and restarting it drains them;
   - `kill -9` of the worker mid-execution yields `worker_lost` with no transaction, and the API stays up;
   - `/health/notification-worker` reports 503 while the worker is stopped and 200 after it starts.
4. Feature rollback: deactivate models, or revert the PR. Runs and models are independent of existing data.
