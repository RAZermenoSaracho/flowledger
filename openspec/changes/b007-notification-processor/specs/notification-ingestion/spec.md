# Spec Delta

## ADDED Requirements

### Requirement: Ingest endpoint

`POST /v1/notification-models/:id/notifications` SHALL accept the notification as `text/plain` or as JSON `{ "text": "..." }` and answer `202` with `{ runId, status: "queued", duplicate }`. It SHALL require an API key with the ingest scope: a missing or invalid key SHALL give 401 and a key with other scopes SHALL give 403. An unknown, foreign or inactive model SHALL give 404, with the same response for all three. Text SHALL be 1 to 4,000 characters, otherwise 400.

#### Scenario: Plain text body
- **WHEN** an ingest key posts plain text to an active model it owns
- **THEN** the response is 202 with a run id, status `queued` and `duplicate` false

#### Scenario: JSON body
- **WHEN** the same is posted as `{ "text": "..." }`
- **THEN** the response is the same

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

### Requirement: Ingest limits

Ingest requests SHALL pass through the shared `/v1` per-credential rate limit. A user SHALL NOT have more than 100 runs queued or running; a request beyond either limit SHALL get 429.

#### Scenario: Key rate limit
- **WHEN** a key exceeds the shared `/v1` rate limit within a minute
- **THEN** the response is 429

#### Scenario: Pending backlog
- **WHEN** the owner already has 100 queued or running runs
- **THEN** a new request gets 429 and no run is created

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

### Requirement: Asynchronous processing

Accepted notifications SHALL be processed asynchronously and concurrently, with a configurable concurrency of at least several runs at once. A run queued when its model is deactivated SHALL be skipped with reason `model_inactive`.

#### Scenario: Acknowledged before processing
- **WHEN** a notification is accepted
- **THEN** the response does not wait for the script and the run later reaches a final status

#### Scenario: Concurrent runs
- **WHEN** several runs are queued
- **THEN** several are processed at the same time up to the configured concurrency

#### Scenario: Deactivated while queued
- **WHEN** the owner deactivates the model before a queued run starts
- **THEN** the run ends as skipped with reason `model_inactive`

### Requirement: Transaction creation

When a script returns a proposal, the system SHALL create the transaction through the existing transaction rules as the model owner, including ownership, archived records, transfer rules and currency fallback. The date SHALL default to the time the notification was received. A slot key that is unknown or unbound SHALL fail the run with `mapping_missing:<key>`. A transaction validation error SHALL fail the run with its message.

#### Scenario: Expense created
- **WHEN** the Plata example run produces its expense proposal
- **THEN** an expense named OXXO of 1234.50 MXN is created in the owner's bound account and category, dated at the receive time, and the run is `created` with the transaction id

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

Each run SHALL link to at most one transaction. A run interrupted while creating its transaction SHALL be marked failed with `interrupted_during_create` and SHALL never be retried.

#### Scenario: Interrupted during creation
- **WHEN** the service stops while a run is creating its transaction
- **THEN** after restart the run is `failed` with `interrupted_during_create` and is not run again

#### Scenario: One transaction per run
- **WHEN** a run is claimed by two workers at once
- **THEN** only one proceeds and at most one transaction results

### Requirement: Retry and recovery

Infrastructure failures before transaction creation SHALL be retried up to 3 attempts in total, then fail as `interrupted`. Deterministic script outcomes (errors, timeouts, invalid results, mapping and validation failures) SHALL NOT be retried. On start and periodically, queued runs SHALL be resumed and runs left running for too long SHALL be requeued under the same attempt rule.

#### Scenario: Infrastructure failure
- **WHEN** the sandbox cannot start for a run
- **THEN** the run is retried until 3 attempts are used, then `failed` with `interrupted`

#### Scenario: Script failure not retried
- **WHEN** a script raises an exception or times out
- **THEN** the run is `failed` once and is not retried

#### Scenario: Restart
- **WHEN** the service restarts with queued and stale running runs
- **THEN** they are processed and none is lost

### Requirement: Graceful shutdown

On shutdown the service SHALL stop claiming new runs, give in-flight runs a short time to finish, and leave no run lost; interrupted runs SHALL be recovered at the next start.

#### Scenario: Shutdown with in-flight runs
- **WHEN** shutdown is requested while runs are in flight
- **THEN** no new run starts, finishing runs complete, and the rest are recovered on next start

### Requirement: Run logs

`GET /notification-models/:id/runs` SHALL return the model's runs to the owner only, newest first and paginated, with received time, status (`queued`, `running`, `created`, `skipped`, `failed`), reason and transaction id. Notification text SHALL be cleared 7 days after a run completes.

#### Scenario: Owner views logs
- **WHEN** the owner lists runs
- **THEN** runs are newest first with status, reason and transaction id, paginated

#### Scenario: Foreign model logs
- **WHEN** another user requests the runs
- **THEN** the response is 404

#### Scenario: Retention
- **WHEN** a run finished more than 7 days ago
- **THEN** its text is no longer available while its status, reason and transaction link remain

### Requirement: Privacy of notification content

Notification text and credentials SHALL NOT appear in application logs or error bodies. One user's key SHALL never create or reveal another user's runs or transactions.

#### Scenario: Error response
- **WHEN** an ingest request fails validation or processing
- **THEN** the error body does not contain the notification text or any credential

#### Scenario: Application logs
- **WHEN** a notification is ingested and processed
- **THEN** application logs contain no notification text
