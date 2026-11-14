# notification-ingestion Specification

## Purpose
Accept notification text on a per-model authenticated endpoint, queue it durably in Postgres, and process it asynchronously in the separate notification worker with per-user and global concurrency limits.

## Requirements

### Requirement: Ingest endpoint

`POST /v1/notification-models/:id/notifications` SHALL accept a JSON body `{ "text": "..." }` and nothing else: `text/plain` bodies and extra fields SHALL give 400. It SHALL answer `202` with `{ runId, status, duplicate }` only after the run is persisted, where `status` is `queued` for a new run and the existing run's current status for a duplicate; if persistence fails the response SHALL be 503 and nothing SHALL be acknowledged. It SHALL require an API key with the ingest scope: a missing or invalid key SHALL give 401 and a key with other scopes SHALL give 403. An unknown, foreign or inactive model SHALL give 404, with the same response for all three. Text SHALL be 1 to 4,000 characters, otherwise 400. An optional `Idempotency-Key` header is supported.

#### Scenario: JSON body
- **WHEN** an ingest key posts `{ "text": "..." }` to an active model it owns
- **THEN** the response is 202 with a run id, status `queued` and `duplicate` false

#### Scenario: Plain text rejected
- **WHEN** the body is sent as plain text
- **THEN** the response is 400 and no run is created

#### Scenario: Extra field
- **WHEN** the JSON body contains a field other than `text`
- **THEN** the response is 400 and no run is created

#### Scenario: Persistence failure
- **WHEN** the run cannot be persisted because the database fails
- **THEN** the response is 503, not 202, and nothing is acknowledged

#### Scenario: Authentication
- **WHEN** the key is missing or invalid
- **THEN** the response is 401
- **WHEN** a read or write key is used
- **THEN** the response is 403

#### Scenario: Indistinguishable 404
- **WHEN** the model does not exist, belongs to another user, or is inactive
- **THEN** the responses are all 404 and identical in shape

#### Scenario: Text length
- **WHEN** the text is empty or longer than 4,000 characters
- **THEN** the response is 400 and no run is created

### Requirement: Ingest limits and capacity

Ingest requests SHALL pass through the shared `/v1` per-credential rate limit. A request SHALL be rejected when the user already has 500 or more queued runs across all models (a soft cap: simultaneous requests may overshoot it by a few runs); a request beyond either limit SHALL get 429, and the capacity 429 SHALL carry `Retry-After: 60`. The processing concurrency limits SHALL never reject or delay acceptance.

#### Scenario: Key rate limit
- **WHEN** a key exceeds the shared `/v1` rate limit within a minute
- **THEN** the response is 429

#### Scenario: Queue capacity
- **WHEN** the owner already has 500 queued runs
- **THEN** a new request gets 429 with `Retry-After: 60` and no run is created

#### Scenario: Saturation accepted and drained
- **WHEN** far more notifications arrive than the concurrency limits can run at once, within the queue capacity
- **THEN** all are accepted with 202, and they are processed over time without exceeding the limits

### Requirement: Duplicate delivery

Duplicate deliveries to the same model SHALL be collapsed. Two requests with the same `Idempotency-Key` header, or without one the same text within the same 10-minute window, SHALL return 202 with the same run id and `duplicate: true`, and SHALL NOT produce a second transaction. Deduplication SHALL be scoped per model, so it can never reveal or reuse another user's or model's run.

#### Scenario: Same idempotency key
- **WHEN** a request repeats an earlier `Idempotency-Key` for the same model
- **THEN** the response is 202 with the earlier run id and `duplicate: true`

#### Scenario: Same text in the window
- **WHEN** identical text is posted twice within the same 10-minute window
- **THEN** only one run exists and one transaction can result

#### Scenario: Same text in a later window
- **WHEN** identical text is posted again in a later window
- **THEN** a new run is created

#### Scenario: Cross-user isolation
- **WHEN** another user's key sends the same text or idempotency key to its own model
- **THEN** it receives its own run and never the first user's run id

### Requirement: Persistent queue and concurrency

Accepted notifications SHALL be kept in a persistent queue per model and processed asynchronously by a separate worker process from the same codebase. An HTTP API instance SHALL only authenticate, validate and persist ingests and acknowledge them; it SHALL never claim or execute runs. The API and workers SHALL coordinate only through shared Postgres. Workers SHALL poll every 2 seconds without an API-to-worker signal. Claims SHALL enforce the limits atomically through a Serializable database transaction. The number of runs executing at once across all worker processes SHALL NOT exceed `NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL` (default 4, integer 1 to 64), and per user SHALL NOT exceed `NOTIFICATION_PROCESSOR_MAX_CONCURRENT_PER_USER` (default 2, integer 1 to 64, at most the global limit). Invalid values SHALL stop the service from starting with an error naming the variable. Scheduling SHALL be fair: users with fewer running runs first, then models with fewer running runs, then the oldest queued run. Runs of one model SHALL start in the order received, though completion order is not guaranteed. A run SHALL be claimed by exactly one worker across all worker processes. A run queued when its model is deactivated SHALL be skipped with reason `model_inactive`. Run states are `queued`, `processing`, `completed`, `skipped` and `failed`.

#### Scenario: Acknowledged before processing
- **WHEN** a notification is accepted
- **THEN** the response does not wait for the script and the run later reaches a final status

#### Scenario: Concurrency limits
- **WHEN** many runs are queued and multiple worker processes claim them concurrently
- **THEN** no more than the global limit run at once, and no user has more than the per-user limit running

#### Scenario: Misconfigured limits
- **WHEN** a concurrency variable is out of range, not an integer, or the per-user limit exceeds the global limit
- **THEN** the service refuses to start and the error names the variable

#### Scenario: Fairness
- **WHEN** one user has a large backlog and another user queues one run
- **THEN** the second user's run starts without waiting for the first user's backlog to drain

#### Scenario: Per-model order
- **WHEN** one model has several queued runs
- **THEN** they start in the order received

#### Scenario: No double claim
- **WHEN** several worker processes look for work at the same time
- **THEN** each run is claimed by only one of them

#### Scenario: Deactivated while queued
- **WHEN** the owner deactivates the model before a queued run starts
- **THEN** the run ends as skipped with reason `model_inactive`

### Requirement: Acceptance during worker unavailability

Worker unavailability SHALL NOT affect acceptance of otherwise valid ingests within queue capacity. The API SHALL persist them and return 202; runs SHALL remain queued until a worker starts.

#### Scenario: Worker stopped
- **WHEN** no worker is running and a valid notification arrives within queue capacity
- **THEN** the API returns 202 after persistence, the run stays queued, and a worker processes it after starting

### Requirement: Worker schema readiness

A worker SHALL verify that the required database schema is migrated before claiming or processing any run. If it is not migrated, the worker SHALL exit with status 1 and its supervisor SHALL restart it with backoff.

#### Scenario: Missing migration
- **WHEN** a worker starts against an unmigrated schema
- **THEN** it exits with status 1 without claiming or processing a run, and its supervisor restarts it with backoff

### Requirement: Worker health

The API SHALL expose unauthenticated `GET /health/notification-worker`, returning only a worker count. A worker SHALL be live for this endpoint when last seen within 60 seconds. The response SHALL be 200 with `{ workers: n }` when at least one worker is live, otherwise 503 with `{ workers: 0 }`.

#### Scenario: Live workers
- **WHEN** two workers have been seen within 60 seconds and another has not
- **THEN** the endpoint returns 200 with `{ workers: 2 }` without authentication or worker details

#### Scenario: No live worker
- **WHEN** no worker has been seen within 60 seconds
- **THEN** the endpoint returns 503 with `{ workers: 0 }` without authentication

### Requirement: Transaction creation

When a script returns a proposal, the system SHALL create the transaction through the existing transaction rules as the model owner, including ownership, archived records, transfer rules and currency fallback. The date SHALL default to the time the notification was received. A slot key that is unknown or unbound SHALL fail the run with `mapping_missing:<key>`. A transaction validation error SHALL fail the run with its message.

#### Scenario: Expense created
- **WHEN** the Plata example run produces its expense proposal
- **THEN** an expense named OXXO of 1234.50 MXN is created in the owner's bound account and category, dated at the receive time, and the run is `completed` with the transaction id

#### Scenario: Unbound slot
- **WHEN** a proposal names a slot with no binding
- **THEN** the run is `failed` with `mapping_missing:<key>` and no transaction is created

#### Scenario: Binding became archived
- **WHEN** a bound account was archived after activation
- **THEN** the run is `failed` with the validation message and no transaction is created

#### Scenario: Skip
- **WHEN** the script skips
- **THEN** the run is `skipped` with the reason and no transaction is created

### Requirement: At-most-once creation

Each run SHALL link to at most one transaction. A run SHALL be `completed` if and only if its transaction was created in the same database transaction (if the user later deletes that transaction, the run keeps `completed` with an empty link): completion and transaction creation SHALL commit together.

#### Scenario: One transaction per run
- **WHEN** a run is claimed by two workers at once
- **THEN** only one proceeds and at most one transaction results

#### Scenario: Completed implies transaction
- **WHEN** a run is `completed`
- **THEN** its transaction was created in the same commit, and a run whose creation did not commit is never `completed`

### Requirement: Recovery without retries

The system SHALL NOT retry runs automatically. Queued runs SHALL survive worker crashes and restarts and be processed later. Each worker process SHALL have one liveness row, refreshed every 15 seconds; recovery SHALL use worker liveness rather than individual run activity. Worker failure or restart SHALL NOT take the HTTP API down or lose queued runs. A `processing` run whose worker liveness row is missing or whose last-seen time is stale for more than 2 minutes SHALL become `failed` with reason `worker_lost`, SHALL never be executed again and SHALL never have a transaction.

#### Scenario: Restart keeps queued
- **WHEN** the worker crashes or restarts while runs are queued
- **THEN** the API stays available, none of the queued runs is lost, and they are processed when a worker starts

#### Scenario: Crashed in-flight run
- **WHEN** a worker crashes while a run is processing and its worker liveness row is missing or stale for more than 2 minutes
- **THEN** the run is `failed` with reason `worker_lost`, has no transaction, and is not executed again

#### Scenario: Script failure not retried
- **WHEN** a script raises an exception or times out
- **THEN** the run is `failed` once and is not retried

### Requirement: Graceful shutdown

On shutdown the worker process SHALL stop claiming new runs and give in-flight runs a short time to finish. A run whose sandbox execution is aborted before transaction creation SHALL return to `queued`.

#### Scenario: Shutdown with in-flight runs
- **WHEN** shutdown is requested while runs are in flight
- **THEN** no new run starts, finishing runs complete, and runs aborted before creation return to queued

### Requirement: Queue and logs reads

`GET /notification-models/:id/queue` SHALL return the model's `queued` and `processing` runs to the owner only, oldest first, with status, position for queued runs, received time, started time and the start of the notification text. `GET /notification-models/:id/logs` SHALL return only finished runs (`completed`, `skipped`, `failed`), newest first and paginated, with received time, status, reason and transaction id.

#### Scenario: Owner views queue
- **WHEN** the owner reads the queue
- **THEN** pending runs appear oldest first with status and, for queued runs, their position

#### Scenario: Owner views logs
- **WHEN** the owner reads the logs
- **THEN** only finished runs appear, newest first, with status, reason and transaction id, paginated

#### Scenario: Foreign model
- **WHEN** another user requests the queue or logs
- **THEN** the response is 404

### Requirement: Retention

Notification text SHALL be cleared 7 days after a run finishes, and finished runs SHALL be deleted 30 days after finishing, keeping only minimal metadata between day 7 and day 30. `queued` and `processing` runs SHALL never be touched by retention. Retention SHALL be automatic and have no user-facing settings.

#### Scenario: Text cleared
- **WHEN** a run finished more than 7 days ago
- **THEN** its text is no longer available while its status, reason and transaction link remain

#### Scenario: Run deleted
- **WHEN** a run finished more than 30 days ago
- **THEN** it no longer exists

#### Scenario: Pending untouched
- **WHEN** a run has been queued or processing for longer than 30 days
- **THEN** retention does not clear or delete it

### Requirement: Privacy of notification content

Notification text and credentials SHALL NOT appear in application logs or error bodies. One user's key SHALL never create or reveal another user's runs or transactions.

#### Scenario: Error response
- **WHEN** an ingest request fails validation or processing
- **THEN** the error body does not contain the notification text or any credential

#### Scenario: Application logs
- **WHEN** a notification is ingested and processed
- **THEN** application logs contain no notification text
