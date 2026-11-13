# Design

## Context

See proposal.md, Why. Facts verified in the repository on 2026-11-13 at `370098a`:

**What exists today**
- No notification ingestion, rule, regex or script code. The `Notification` model holds in-app notifications only.
- No queue, job table, Redis or locking dependency. The only background job is `SyncfyAutoSyncScheduler`: a `setInterval` with an in-process guard, started and stopped in `apps/api/src/server.ts`. Shutdown does not await in-flight work.
- No Python anywhere in the product.

**Deployment**
- One API process, bound to `127.0.0.1` behind an edge proxy.
- Deployed by `.github/workflows/deploy-prod.yml`, which calls a script outside the repo. The process manager is not in the repo.
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
- Each accepted notification creates at most one transaction.
- Transaction rules stay in the existing service.

**Non-Goals:**
- A general automation or workflow engine, plugin system, or script access to the network or database.
- Exactly-once processing across a crash in the commit window. At-most-once is chosen instead; see Decision 6.
- Running Python in the browser.

## Decisions

### 1. Architecture: extend `apps/api`, with untrusted code out of process (Option A), not `apps/engine`

| | A: `apps/api` module + in-process worker + sandbox child processes (chosen) | B: separate `apps/engine` | C: shared packages + separate worker app |
|---|---|---|---|
| Isolation of untrusted Python | Same in every option: a separate sandbox process | Same | Same |
| Load on API traffic | Python CPU runs in child processes. The worker's own work is small DB calls | Fully separate | Fully separate |
| Operations | No new deploy unit. The external deploy script is unchanged | New process in an external script that the repo cannot see, plus env, restart and monitoring | Same as B, plus a new package build step |
| Database and auth boundary | Calls `createTransaction(ownerId, …)` directly, like MCP does | Either imports api services across apps (a second api entrypoint in disguise) or calls the API over HTTP, which needs a privileged service credential | Requires moving transaction services into a package, a large refactor |
| Lambda path | Swap the body of `runScript()` for a Lambda invoke | Same | Same |
| Testing | Existing vitest, supertest and testcontainers setup | New workspace setup | New workspace and package setup |

The expensive and dangerous part, Python execution, is isolated in all three options. B and C only move the cheap orchestration, and they cost a new deployable, cross-app imports or a privileged credential.

**Extraction trigger.** Revisit if worker load measurably affects API latency, or if the API runs more than one instance. The worker is already multi-instance safe (Decision 5), so the first step would be a second entrypoint (`dist/worker.js`) of the same app, not a new app.

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

**Spike gate (task 1.1).** The spike verifies three things on Node 24:
- That `--permission` with `--allow-fs-read` loads Pyodide.
- The memory mechanism. It tries, in order: the V8 flag that caps WebAssembly memory pages, or else the parent sampling the child's RSS every 100 ms (`ps -o rss=`). It records which works.
- Cold-start time. If it exceeds 2 s, the parent keeps `concurrency` pre-started single-use children; each serves exactly one execution and is replaced.

None of these outcomes changes the specs or the task list.

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

### 5. Async lifecycle (Postgres job table, in-process worker)

**Ingest** (`POST /v1/notification-models/:id/notifications`). The route checks, in order:
1. The `ingest` scope.
2. The existing `/v1` per-credential limiter (120/min). No extra limiter: the pending-run cap protects the worker.
3. The model exists, belongs to the key owner and is active. Otherwise 404.
4. Text is 1 to 4,000 characters. Otherwise 400.
5. The owner has fewer than 100 runs `queued` or `running`, counted through `model: { userId }`, since runs carry no denormalized `userId`. Otherwise 429.

It then inserts a `NotificationRun(status=queued)`, calls `worker.wake()` and returns `202 { runId, status: "queued", duplicate: false }`.

**Dedupe.** The dedupe key is:
- the `Idempotency-Key` header (≤128 characters), when present;
- otherwise `sha256(text) + ":" + floor(receivedAt / 10 min)`.

The constraint `@@unique([modelId, dedupeKey])` enforces it. A conflict returns `202` with the existing run and `duplicate: true`. Identical text more than one bucket apart is processed again, so two identical purchases 10+ minutes apart are both recorded.
`// ponytail: fixed 10-min bucket; a retry straddling a boundary is processed twice — use a sliding-window lookup if this shows up in logs.`

**Worker** (`notificationRunWorker.ts`, started and stopped in `server.ts`). It polls every 5 s and on `wake()`. It claims up to `NOTIFICATION_RUNNER_CONCURRENCY` (default 4) `queued` runs, oldest first. A claim is an optimistic Prisma `updateMany({ where: { id, status: "queued" }, data: { status: "running", startedAt, attempts: { increment: 1 } } })` and succeeds only when `count === 1`. This needs no raw SQL and is safe with several instances.

Each claimed run:
1. Reloads the model. An inactive model gives `skipped` / `model_inactive`, which covers deactivation while queued.
2. Runs the sandbox.
3. Outcomes:
   - On `skip` or `error`, sets the terminal status.
   - On a proposal, first stores `proposal` and sets `status = committing`. Then it calls `createTransaction`, then sets `created` with `transactionId`.

The playground (`POST /notification-models/:id/test`) uses the same semaphore. It waits up to 10 s, then returns 503.

### 6. Retries, recovery, shutdown

- **Deterministic outcomes are never retried.** These are script errors, timeouts, invalid results, mapping and validation errors.
- **Infrastructure failures are retried.** Before `committing`, a failed sandbox spawn or a worker crash puts the run back to `queued` if `attempts < 3`. Otherwise it becomes `failed` / `interrupted`.
- **Recovery** runs at worker start and every minute:
  - A run `running` for more than 2 minutes is requeued, under the same rule.
  - A run left in `committing` becomes `failed` / `interrupted_during_create` and is **never** retried. Its transaction may or may not exist, and the Logs tab says so.

  This gives at-most-once creation without changing `createTransaction` to accept an outer transaction client.
- **Graceful shutdown.** `stop()` stops claiming, waits up to 10 s for in-flight runs, then kills the children. `server.ts` awaits it before `prisma.$disconnect()`. Interrupted runs are recovered at the next start.
- **Retention.** The minute tick also sets `text = null` on runs finished more than 7 days ago.

### 7. Data model

```prisma
enum NotificationModelVisibility { private public }
enum NotificationRunStatus { queued running committing created skipped failed }

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
  status        NotificationRunStatus @default(queued)
  dedupeKey     String
  text          String?               // cleared 7 days after finishedAt
  proposal      Json?
  reason        String?               // skip reason or error (≤500 chars, never contains credentials)
  attempts      Int      @default(0)
  transactionId String?  @unique
  receivedAt    DateTime @default(now())
  startedAt     DateTime?
  finishedAt    DateTime?
  model         NotificationModel @relation(fields: [modelId], references: [id], onDelete: Cascade)
  transaction   Transaction?      @relation(fields: [transactionId], references: [id], onDelete: SetNull)
  @@unique([modelId, dedupeKey])
  @@index([status, receivedAt])
  @@index([modelId, receivedAt])
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
| `GET /notification-models/:id/runs` | paginated, newest first |
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
  - an endpoint `CopyRow` with the full URL, plus Shortcut setup text (header `Authorization: Bearer <ingest key>`, JSON body `{"text": "…"}`) and a link to create an ingest key;
  - a slots table (key, kind, label, required) and binding selects over the owner's records;
  - a settings key/value list;
  - origin and version, with an "Update available" action that opens a `ModalDialog`. The dialog shows current and new code side by side, read-only, warns when `localCodeModified`, and offers binding selects for new required slots.
- **Code:** a `CodeEditor` (CodeMirror 6 with `lang-python`, no workers or eval, CSP-safe) bound to `draft.values.code`. A Check button calls `validate` and shows errors by line. A collapsible `<details>` reference lists each helper with signature, description and example, from a constants file.
- **Playground:** a text area and a Run button calling `test` with the current draft code and settings. It shows the outcome, the transaction preview, the reason or error with line, and stdout. It states that nothing is created.
- **Logs:** runs with `usePagination`: received time, status badge, reason, transaction link, and text while retained.

**New models** start at `/notification-models/new` from a commented template script.

**Navigation and keys.** A nav item "Notification models" is added. The API-key create dialog gains "Notification ingest only".

### 11. API keys and `/v1`

- `createApiKeySchema` gains `ingestOnly: boolean` (default false). Combining it with `allowWrite: true` is a 400.
- An ingest-only key stores `["ingest"]`, and `CredentialScope` becomes `"read" | "write" | "ingest"`.
- `requireScope` is unchanged: `ingest` implies nothing and nothing implies `ingest`. An ingest key gets 403 on every other `/v1` route.
- OAuth grants cannot request `ingest`.
- The ingest route uses `auditV1Write("notification.ingest")` and never logs text.
- The route is mounted with `express.text({ type: "text/plain", limit: "8kb" })` before the JSON fallback, so both body forms work.

## Risks / Trade-offs

- **[Sandbox escape to network]** Node 24 does not restrict net. → Three layers; the spike plus a malicious-script test suite gate merge; the risk is documented; Lambda without egress is the upgrade.
- **[Pyodide cold start ~1–2 s and ~100 MB per child]** → Concurrency defaults to 4. A pre-warm pool is added only if the spike measures more than 2 s. Notifications are async anyway.
- **[Crash in the commit window marks a run `interrupted_during_create`]** → It is rare, visible in Logs and never duplicated. Upgrade path: pass an outer tx into `createTransaction`.
- **[Published code is unreviewed]** → Copies install inactive and private, the code is shown before install, and it runs only against the installer's own bound records in the same sandbox.
- **[Published settings may contain personal text]** → The publish confirm lists every published field. Bindings are never published.
- **[iPhone trigger feasibility]** The roadmap's earlier research found no Shortcuts trigger for other apps' notifications. → The endpoint is client-agnostic (Shortcuts from SMS, Mail or Wallet triggers, Android Tasker, curl). The owner confirms the real-device path in the staging acceptance step; it does not block implementation.
- **[In-memory rate limiter per process]** → Acceptable with one instance, as for the rest of `/v1`.

## Migration Plan

1. Run one additive Prisma migration (three tables, two enums). No backfill. Rollback is dropping them.
2. Ship in the B-007 PR to `razs_ai`. The `pyodide` package is installed by `npm ci` on the host, so the deploy script needs no change.
3. Staging acceptance on `flowledger-dev`:
   - create, test, activate;
   - an ingest key;
   - a real Shortcut or curl POST creates a transaction;
   - a duplicate is collapsed;
   - a promotion is skipped;
   - the malicious-script suite fails safely;
   - restarting the API mid-queue recovers.
4. Feature rollback: deactivate models, or revert the PR. Runs and models are independent of existing data.
