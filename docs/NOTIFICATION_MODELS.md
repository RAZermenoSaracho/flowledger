# Notification Models

Notification models turn notification text into a transaction proposal using a validated Python subset. Models, bindings and runs belong to the owner. Required slots must reference owned, usable records before activation. The playground executes draft code without creating a run or transaction.

## Architecture

Two processes use one `apps/api` codebase and share PostgreSQL:

- HTTP API (`src/server.ts`): authenticates requests, manages models, validates scripts, persists ingests and serves health checks. It never claims queued runs.
- Notification worker (`src/worker.ts`): claims runs, starts isolated sandbox children and calls the existing transaction service.

Postgres stores the durable queue; there is no broker or `apps/engine`. Reusing services avoids cross-app imports, a privileged service credential and a separate package build. Revisit a separate app if the worker needs a different runtime or deployment cadence. Execution could move behind `runScript()` to an egress-disabled Lambda without replacing queue or recovery logic.

Published versions snapshot name, description, code, slots and settings, never bindings. Installation creates a private, inactive copy with empty bindings. Copies keep working when the original becomes private or is deleted; deletion removes update tracking. Source updates keep the user's name, merge settings by key and preserve bindings only for unchanged slot keys and kinds. Missing required bindings reject the update.

## Script contract

Define `process(text, ctx)`. `text` contains 1–4,000 characters; `ctx.received_at` is the server receive time as a UTC ISO string, and `ctx.settings` is a string-to-string dictionary. Return one helper proposal, `skip(reason)`, or `None` (`skipped`, reason `no result`). Other return values fail with `invalid result`; uncaught exceptions report their type, message and script line.

Amounts must be decimal strings or `Decimal` values (converted to strings); floats fail. Account, destination account, category and Group arguments are slot keys, never database IDs. The worker resolves bindings, validates the shared proposal and transaction schemas, and calls `createTransaction` as the owner. Missing mappings fail with `mapping_missing:<key>`. Date defaults to `receivedAt`; currency uses the existing transaction service's fallback rules. Transfers have no category or Group.

### Helper reference

| Signature | Behavior / example |
|---|---|
| `expense(amount, name, account=None, category=None, group=None, date=None, currency=None, notes=None)` | Expense proposal: `expense("10.50", "Lunch", account="card", category="food")` |
| `income(amount, name, account=None, category=None, group=None, date=None, currency=None, notes=None)` | Income proposal: `income("2000.00", "Payment", account="card")` |
| `transfer(amount, name, account, to_account, date=None, currency=None, destination_amount=None, notes=None)` | Transfer proposal: `transfer("500.00", "Savings", "card", "savings")`; optional destination amount for a different currency |
| `skip(reason)` | Deliberate skip; reason truncated to 200 characters: `skip("promotion")` |
| `amount(s, decimal=".", thousands=",")` | Extracts the first number as a decimal string: `amount("$1,234.50")` → `"1234.50"`; raises `ValueError` if no amount is found |
| `normalize(s)` | Lowercases, strips accents and collapses whitespace: `normalize("  PROMOCIÓN  ")` → `"promocion"` |
| `parse_date(s, fmt)` | Uses `strptime`; returns an ISO date, or datetime when the format includes `%H` or `%I`: `parse_date("13/11/2026", "%d/%m/%Y")` → `"2026-11-13"` |
| `Decimal(value)` | Decimal arithmetic: `Decimal("10.50") + Decimal("2.00")` |
| `print(*args, sep=" ", end="\n")` | Captured stdout, truncated to 4,096 characters |
| `re.search`, `re.match`, `re.fullmatch`, `re.findall`, `re.finditer`, `re.sub`, `re.split`, `re.compile`, `re.escape` | Standard regex signatures; e.g. `re.search(r"\d+", text)`. Flags: `I`, `IGNORECASE`, `M`, `MULTILINE`, `S`, `DOTALL` |

### Plata example

Input: `Compraste $1,234.50 MXN en OXXO con tu tarjeta terminación 1234`

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

With `card` bound to the owner's Plata account and `general` to their category, this creates an expense named `OXXO`, amount `"1234.50"`, currency `MXN`, dated at receive time. `¡Aprovecha 10% de cashback!` is skipped as `promotion`.

## Sandbox

Pyodide **314.0.7** runs CPython in a fresh child for each execution, with roughly **2.5–3 s cold start** and no shared script state. Three layers apply:

1. AST validation on save and before execution: maximum 20,000 code characters; rejects imports, classes, global/nonlocal, with, async/await, yield, generator expressions, decorators and match. Names and attributes starting with `_`, frame/code traversal attributes and `format`, `format_map`, `mro` are forbidden. Validation errors include line and column.
2. Restricted builtins and helper namespace. Ordinary collection, numeric and string operations plus `Exception` and `ValueError` are available; `open`, `eval`, `exec`, `getattr` and imports are unavailable to scripts. `re` is a restricted namespace. Bootstrap removes Python-to-JS bridge modules and deletes child `fetch` and `WebSocket` globals.
3. Process isolation: empty environment, no shell, JSON-line stdin/stdout protocol, Node 24 permission model denying file writes, child processes, workers and native addons. Read access is limited to Pyodide and sandbox directories, with a separate `--allow-fs-read=<dir>/*` flag for each. The child shims only `process.binding("constants")` using public `fs.constants`; other bindings throw.

The child uses `--max-old-space-size=128` (128 MB V8 heap) and `--wasm-max-mem-pages=4096` (256 MB WebAssembly linear memory). These are separate limits, not a total RSS cap. The parent kills children after 2 s of script execution following readiness, 15 s total lifetime, or over 64 KB protocol stdout. Resource exhaustion and regex backtracking fail with `resource_limit` or `timeout`. Playground capacity is separate: 2 per API process, 1 per user; busy requests return 503.

**Residual network risk:** Node 24 permissions do not block outbound network. A Python/WebAssembly/JS escape past the first two layers could reach it. An execution service with disabled egress is the upgrade path.

## Queue and concurrency

Each accepted notification is a durable `NotificationRun`; each model has a logical queue in the same table. Workers poll every 2 s. A claim uses one Serializable Prisma transaction to count all processing runs, exclude users at their limit, and select a queued head by lowest user processing count, then lowest model processing count, then oldest head. Within the chosen model, `receivedAt` then `id` give FIFO claim order; concurrent runs can finish out of order. A guarded update sets `processing`, `workerId` and `startedAt`. Serialization conflicts (`P2034`) get at most three attempts. Limits hold across worker processes sharing the database; fairness prevents one user's backlog monopolizing available capacity.

| Variable | Default | Valid values |
|---|---|---|
| `NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL` | `4` | Integer 1–64 |
| `NOTIFICATION_PROCESSOR_MAX_CONCURRENT_PER_USER` | `2` | Integer 1–64, no greater than global |

Both processes validate their environment at startup. Invalid values or per-user greater than global throw a configuration error and prevent startup; limits are not clamped. Use matching values on all processes. Tune concurrency to host memory and sandbox cold-start cost.

Capacity is a soft cap of **500 queued runs per user** across models, excluding processing runs. At capacity, ingestion returns **429** with **`Retry-After: 60`**; simultaneous count-and-insert requests can slightly exceed the cap. The existing `/v1` per-credential limiter also applies (120/min). Clients should back off on 429 and retry unavailable ingests with a stable idempotency key. Even duplicate requests encounter the capacity check first.

## Lifecycle and recovery

```mermaid
stateDiagram-v2
    [*] --> queued: persisted ingest
    queued --> processing: atomic claim
    processing --> completed: transaction and run commit together
    processing --> skipped: skip / no result / model_inactive
    processing --> failed: script / mapping / validation / internal_error / worker_lost
    processing --> queued: graceful abort before create
```

Every terminal update is guarded by run ID, `processing` status and claiming worker ID. Transaction creation and the `completed` update commit together; a guard miss rolls back creation. Unexpected processing failures on a live worker become `failed` / `internal_error`, rather than holding capacity forever. Error reasons are capped at 500 characters; notification text is not logged.

- **Never started:** queued rows survive crashes and restarts and are claimed when capacity returns.
- **In flight at crash:** never automatically re-executed. Workers heartbeat every 15 s; maintenance runs at startup and every minute. Processing runs without a worker seen within 2 minutes become `failed` / `worker_lost`, with no transaction. A late worker cannot commit through the terminal guard. Lost runs can occupy capacity until recovery. Worker rows unseen for 1 hour are removed.
- **Graceful shutdown:** SIGTERM/SIGINT stop claims, abort executing sandbox children and requeue those runs with cleared ownership/start time. Runs already creating a transaction finish. Shutdown waits at most 10 s, removes the worker row and disconnects Prisma; unfinished processing runs use crash recovery. PM2's 15 s kill timeout allows this drain.

To resend a terminal failure, use a new idempotency key or a new text/time bucket; repeating the old key returns the old run.

## Retention

Maintenance clears terminal run text 7 days after `finishedAt` and deletes terminal runs after 30 days. Deleting a run never deletes its transaction. Queued and processing runs are never deleted by retention, regardless of age. Deleting a model explicitly cascades its runs, including pending work.

## Ingest contract

`POST /v1/notification-models/:id/notifications` requires an **ingest-only** API key (`Authorization: Bearer fl_...`) owned by the model owner. Read/write keys and OAuth grants do not imply `ingest`; ingest keys cannot access other `/v1` routes. The model must be active.

Send `Content-Type: application/json` and exactly `{"text": "..."}` (1–4,000 characters, no extra fields). Optional `Idempotency-Key` is 1–128 characters. Without it, dedupe uses `sha256(text):floor(receivedAt / 600000)`, unique per model. A retry across a ten-minute boundary can produce another run; dedupe lasts only while the run is retained.

```bash
curl -X POST 'http://127.0.0.1:4000/v1/notification-models/MODEL_ID/notifications' \
  -H 'Authorization: Bearer fl_REPLACE_WITH_INGEST_KEY' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: plata-purchase-001' \
  --data '{"text":"Compraste $1,234.50 MXN en OXXO con tu tarjeta terminación 1234"}'
```

| Status | Meaning |
|---|---|
| `202` | Persisted run: `{ "runId": "...", "status": "queued", "duplicate": false }`; duplicate returns existing status and `duplicate: true`. Acceptance does not mean transaction creation. |
| `400` | Invalid JSON contract or idempotency key |
| `401` | Missing or invalid credential |
| `403` | Credential lacks `ingest` scope |
| `404` | Missing, foreign or inactive model |
| `429` | Queue capacity (`Retry-After: 60`) or `/v1` rate limit |
| `503` | Database/queue unavailable; ingest not acknowledged |

## Deployment

The worker entry is **`dist/worker.js`**, built from `src/worker.ts` by the API build. Start from the repo root with `npm run start:worker -w @flowledger/api`. It has no HTTP listener. Root `npm run dev` and `npm run start` run API, worker and web together.

Before starting, the worker checks schema readiness with `notificationRun.findFirst` and `notificationWorker.count`. Missing tables/columns (`P2021`/`P2022`) log `notification worker: schema not migrated` and **exit 1**. PM2 restarts with backoff. Deploy in order **migrate → build → API → worker**.

`GET /health/notification-worker` on the API is unauthenticated: **200 `{ "workers": n }`** when at least one worker was seen within 60 s, otherwise **503 `{ "workers": 0 }`**.

The operator makes two host changes; `~/scripts/deploy-flowledger-prod.sh` is outside the repo:

1. One-time PM2 registration:

   ```bash
   cd ~/production/flowledger/apps/api && pm2 start npm --name flowledger-prod-worker --kill-timeout 15000 --exp-backoff-restart-delay 1000 -- run start:worker && pm2 save
   ```

2. In `~/scripts/deploy-flowledger-prod.sh`, add this line after `pm2 restart flowledger-prod-api` and before `pm2 save`:

   ```bash
   pm2 restart flowledger-prod-worker --update-env
   ```

After deploy:

```bash
curl -fsS http://127.0.0.1:4000/health/notification-worker
pm2 status
```

Expect HTTP 200 and both API and worker online. Staging uses the same commands from its checkout with its own process name (for example `flowledger-dev-worker`) and API port.

Start, stop or restart the worker independently with `pm2 start|stop|restart flowledger-prod-worker`; inspect `pm2 logs flowledger-prod-worker`. Stopping the worker only pauses processing: the API keeps accepting ingests until backpressure applies. Restarting drains durable queued work; crashed in-flight work follows the recovery rules above.
