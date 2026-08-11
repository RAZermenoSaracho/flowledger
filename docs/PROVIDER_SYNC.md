# Provider Sync Architecture

---

## Provider abstraction

FlowLedger uses a `FinancialProviderAdapter` interface (`apps/api/src/modules/accounts/types/provider.types.ts`) that any bank integration must implement. This allows future providers (Plaid, Belvo, MX, open banking APIs) to be added without touching shared business logic.

The adapter defines optional capabilities:

| Capability | Method | Used for |
|---|---|---|
| Institution list | `listInstitutions()` | Show available banks |
| Connector list | `listConnectors()` | Show regional connectors |
| User creation | `createUser()` | Create a provider-side user |
| Session creation | `createSession()` | Get a provider session token |
| Connection flow | `createConnectionFlow()` | Launch the provider widget/OAuth |
| Webhook handling | `handleWebhook()` | Process incoming events |
| Account fetch | `fetchAccounts()` | Pull accounts for a credential |
| Transaction fetch | `fetchTransactions()` | Pull transactions |
| Account normalize | `normalizeAccount()` | Map raw payload to internal type |
| Transaction normalize | `normalizeTransaction()` | Map raw payload to internal type |

Adapters are registered in `providerRegistry.ts`. Currently only `"syncfy"` is registered.

---

## Syncfy integration

### User lifecycle

Each FlowLedger user maps to a Syncfy user. The mapping is stored in `UserAuthAccount` with `provider = "syncfy"`.

On first connection:

1. `POST /providers/connections` triggers `getOrCreateSyncfyUserForFlowLedgerUser(userId)`
2. Checks `UserAuthAccount` for existing `syncfy` mapping
3. If none, calls `GET /v1/users?id_external=<userId>` on Syncfy API
4. If not found, calls `POST /v1/users` to create a Syncfy user with `id_external = FlowLedger userId`
5. Saves mapping in `UserAuthAccount`

### Connection flow (widget)

1. Frontend calls `POST /providers/connections` with `{ provider: "syncfy" }`
2. API creates a Syncfy session (`POST /v1/sessions`) and returns `{ token, widget: { scriptUrl, styleUrl, config } }`
3. Frontend loads the Syncfy widget UMD script from `SYNCFY_WIDGET_SCRIPT_URL`
4. Widget handles bank credential entry — FlowLedger never sees bank credentials
5. On widget completion, Syncfy calls the configured webhook URL with a `credentials.refreshed` event

Since the webhook is processed asynchronously (see "Event processing" below), the frontend polls `GET /providers/connections/:id/status` — returns the connection's current `status`/sync fields, its account/imported-transaction counts, and its most recent `ProviderWebhookEvent` — to detect when the widget's connection has finished syncing.

### Manual resync flow

After a user re-authenticates via the widget (`setEntrypointCredential(idCredential)`):

1. Widget completes → frontend calls `POST /providers/syncfy/credentials/:providerCredentialId/refresh`
2. API calls `resyncSyncfyCredential()` → `resyncSyncfyConnection()`
3. Loads stored refresh metadata from `ProviderConnection.rawData.syncfyRefreshMetadata`
4. Creates a Syncfy session for the stored `providerUserId`
5. Fetches accounts and transactions from stored sanitized endpoint paths
6. Uses bounded retry/backoff (`[0, 5000, 15000, 30000]` ms delays) to handle Syncfy's async data availability
7. Retry stops early if new transactions are inserted or balances change
8. Returns a `SyncfyResyncSummary`

For connections needing reconnect (`setEntrypointUpdateCredential(idCredential)`):

The same `POST /providers/syncfy/credentials/:providerCredentialId/refresh` endpoint handles both resync and reconnect. The widget entrypoint choice is made on the frontend.

### Connection resync (by connection ID)

`POST /providers/connections/:id/resync` — used by the accounts page to trigger a full resync of a connection. Also calls `resyncSyncfyConnection()`.

`POST /providers/accounts/:id/resync` — a per-account convenience route: resolves the `ProviderAccount`'s owning `ProviderConnection` and resyncs that whole connection (`resyncProviderAccount()` in `providerConnections.update.service.ts`). It does not resync only that one account.

---

## Webhook processing

### Route

`POST /providers/webhooks/syncfy`

No authentication. Verified via HMAC signature.

### Signature verification

Located: `apps/api/src/modules/accounts/providers/syncfy/syncfy.webhookSecurity.ts`

The `SYNCFY_WEBHOOK_SIGNATURE_KEY` env var holds the HMAC key. The key can be:
- A raw UTF-8 string
- A JSON-encoded string (`"key"`)
- A JSON object with a nested `k` field (JWK-like format with `base64url`-encoded key material)

Signature can arrive in many formats:
- Raw hex digest
- `sha256=<hex>` prefix
- Base64 or Base64URL encoded
- Structured: `t=<timestamp>;v1="<sig>"`, `keyId="...";signature="..."`, etc.

The verifier tries all combinations of key material extraction and digest encoding, using constant-time comparison to prevent timing attacks.

Return values: `"valid"` | `"invalid"` | `"skipped"` (no key configured).

**NEVER remove or bypass signature verification.**

### Event flow

```
POST /providers/webhooks/syncfy
  1. sanitizeWebhookHeaders() — redact signature/auth headers before storing
  2. verifySyncfyWebhookSignature() — verify HMAC
     → if "invalid": record failed event, return 200 (to prevent Syncfy retries)
  3. Parse body with syncfyWebhookSchema — a batch `rid` plus zero or more events
     → if the body fails schema validation: record failed event, return 200 (same as an invalid signature)
  4. For each event:
     a. Generate/use event ID (eid from Syncfy, or deterministic hash of the event + rid if absent)
     b. Resolve FlowLedger userId from Syncfy id_user via UserAuthAccount
     c. Insert ProviderWebhookEvent (unique on `(provider, providerEventId)`) — on a concurrent duplicate insert, fetches and reuses the already-recorded row instead of processing it again
  5. Return 200 with the batch `rid`, signature verification result, and accepted event count
  6. Async: processRecordedEvent() → handleWebhook() → processSyncfyWebhookEvent()
```

### Event processing (async, fire-and-forget)

`processSyncfyWebhookEvent()` in `accounts/providers/syncfy/services/create.service.ts`:

1. Claim event: update `status: "received"` → `"processing"` (idempotent — already-claimed events return `"ignored"`)
2. Check event name: only `credentials.refreshed` is processed; others are marked `"ignored"`
3. Call `processSyncfyCredentialRefresh()` with `idUser`, `providerCredentialId`, `endpoints` from event payload

### Credential refresh processing

`processSyncfyCredentialRefresh()`:

1. Extract account and transaction endpoint lists from `payload.endpoints`
2. Create a Syncfy session for `idUser`
3. Fetch accounts from each account endpoint
4. Fetch transactions from each transaction endpoint (paginated, last 60 days by default via `SYNCFY_TRANSACTION_LOOKBACK_DAYS`)
5. Check for existing `providerTransactionId` records to skip duplicates
6. Upsert `ProviderConnection` (stores sanitized refresh metadata in `rawData`)
7. Upsert `ProviderAccount` records for each fetched account
8. Insert new `ProviderImportedTransaction` records (status `pending`)
9. Update existing `imported`-status records: → `pending` (no transaction linked) or `processed` (has transaction)
10. Send/update `provider_transactions_pending` notification if new transactions were inserted
11. Mark webhook event `processed`

### Sanitized refresh metadata

When storing endpoint paths in `ProviderConnection.rawData.syncfyRefreshMetadata`, `sanitizeSyncfyDataEndpoint()` removes all sensitive query parameters (`token`, `api_key`, `username`, `password`, `otp`, `twofa`, `security_answer`, `card_number`, `cvv`, `pin`) before saving. Only paths under `syncfyDataBaseUrl` with paths `/v1/accounts` or `/v1/transactions` are accepted.

### Legacy route

`/syncfy/webhook` — deprecated. Does not process events. Returns a deprecation notice. Configure Syncfy to send events to `/providers/webhooks/syncfy`.

---

## Auto-sync scheduler

Located: `apps/api/src/modules/accounts/providers/syncfy/syncfyAutoSyncScheduler.ts`

The scheduler is created and started in `server.ts` on boot.

### Configuration

| Env var | Default | Description |
|---|---|---|
| `SYNCFY_AUTO_SYNC_ENABLED` | `false` | Master on/off switch |
| `SYNCFY_AUTO_SYNC_INTERVAL_MINUTES` | `60` | How often to run |
| `SYNCFY_AUTO_SYNC_JOB_TIMEOUT_MS` | `120000` (2 min) | Per-job timeout |
| `SYNCFY_AUTO_SYNC_CONCURRENCY` | `1` | Jobs processed in parallel |

### How it works

1. On start, `setInterval` schedules `runOnce()` every `intervalMinutes` minutes. Also calls `runOnce()` immediately.
2. `runOnce()` skips if a run is already in progress (prevents overlap).
3. `loadJobs()` queries `ProviderConnection` where:
   - `provider = "syncfy"`
   - `status` in `["active", "sync_failed"]`
   - `requiresManualReconnect = false`
   - Has at least one linked `ProviderAccount` with a `accountId` (confirmed by user)
   - Orders by `lastSyncAt ASC` (oldest-synced first)
4. Workers process jobs with configured concurrency. Each job calls `resyncSyncfyConnection()` with the job timeout.
5. Failures are logged but don't abort other jobs.
6. `stop()` clears the interval; called in the graceful shutdown handler.

### Reconnect detection

`shouldMarkSyncfyManualReconnect(error)` — returns `true` if the error message matches patterns like `mfa`, `otp`, `unauthorized`, `403`, `expired`, etc. When true, the connection and all its accounts are marked `status: "reconnect_required"`, `requiresManualReconnect: true`. This removes them from the auto-sync queue until the user manually reconnects.

---

## Data flow summary

```
Bank (via Syncfy widget)
  ↓  credentials.refreshed webhook
POST /providers/webhooks/syncfy
  ↓  HMAC verified, event deduplicated
ProviderWebhookEvent (status: received → processing → processed)
  ↓  processSyncfyCredentialRefresh()
ProviderConnection.rawData ← sanitized endpoint metadata stored/updated
ProviderAccount ← upserted per bank account
ProviderImportedTransaction (status: pending) ← one per new transaction
  ↓  Notification: "X imported transactions pending review"
User reviews at /transactions?tab=imported
  ↓  POST /transactions/imported/:id/import
Transaction ← created, ProviderImportedTransaction.transactionId set, status: processed
```

---

## Market data providers (read-only, no FinancialProviderAdapter)

Frankfurter and Binance are lightweight external clients — they don't implement `FinancialProviderAdapter` and aren't registered in `providerRegistry.ts`. Beyond listing supported currencies for display, together they back `getExchangeRate(from, to)` in `apps/api/src/modules/currencies/services/read.service.ts`, the single live currency-conversion function used throughout the app: transaction `exchangeRate`/`amountInPreferredCurrency` (`docs/DOMAIN_LOGIC.md` → Transactions → Currency), account balance conversion, report currency conversion, and settlement currency conversion (`docs/DOMAIN_LOGIC.md` → Reports, Debts, Settlement workflow).

| Provider | Module | Purpose | Cache TTL |
|---|---|---|---|
| **Frankfurter** | `apps/api/src/modules/currencies/providers/frankfurter/` | Fiat currency list (`GET .../currencies`); direct fiat→fiat rate lookup (`GET .../latest?from=&to=`) | 24 hours (list) / 5 minutes (rate, per currency pair) |
| **Binance** | `apps/api/src/modules/currencies/providers/binance/` | Crypto base asset list, derived from ticker symbols; USDT-quoted price per asset (`GET .../ticker/price`) | 1 hour (derived crypto list) / 1 minute (raw ticker prices, shared by both uses) |

`getExchangeRate()`'s bridging logic: if both currencies are fiat, the rate comes straight from Frankfurter. If either side is a crypto asset, each side's USD value is resolved independently (fiat via Frankfurter, crypto via its Binance USDT price — treating USDT/USD as 1) and the rate is `usdPerFrom / usdPerTo`. A crypto asset with no Binance quote makes `getExchangeRate()` throw `HttpError(502)` rather than silently degrading; only the currency *list* endpoints degrade gracefully (log and return `[]`) on upstream failure. Both list results and the `/rate` lookup are served to the frontend via `GET /currencies` and `GET /currencies/rate` (no auth required).
