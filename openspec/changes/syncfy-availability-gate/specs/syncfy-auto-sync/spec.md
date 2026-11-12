## ADDED Requirements

### Requirement: Flag gates the whole Syncfy integration

Syncfy SHALL be available only when `SYNCFY_AUTO_SYNC_ENABLED` is enabled and `SYNCFY_API_KEY` is set. While it is unavailable, the API SHALL refuse every user-initiated Syncfy operation (connect, reconnect, credential refresh, connection resync, account resync) with HTTP 503 and the message "Bank synchronization is currently unavailable". The refusal SHALL happen before any Syncfy request and before any Syncfy-related database write. The API SHALL make no outbound Syncfy request from any caller. The API SHALL list no Syncfy connectors or institutions. Normal authentication and ownership checks SHALL still apply.

#### Scenario: Connect while unavailable

- **WHEN** `SYNCFY_AUTO_SYNC_ENABLED=false` and a user posts `/providers/connections` with provider `syncfy`
- **THEN** the response is 503 with the unavailable message and no Syncfy request is made

#### Scenario: Manual resync while unavailable

- **WHEN** `SYNCFY_AUTO_SYNC_ENABLED=false` and a user requests a connection, account or credential resync
- **THEN** the response is 503 and no Syncfy request is made

#### Scenario: Connectors hidden

- **WHEN** Syncfy is unavailable
- **THEN** `GET /providers/connectors` returns no Syncfy connector

#### Scenario: Webhook while unavailable

- **WHEN** Syncfy is unavailable and a correctly signed webhook arrives
- **THEN** the signature is verified and the event is recorded, but it is not processed and no Syncfy request is made

#### Scenario: Existing data stays readable

- **WHEN** Syncfy is unavailable
- **THEN** existing accounts, provider account metadata, connection status, imported transactions and balances are still returned unchanged

#### Scenario: Available

- **WHEN** `SYNCFY_AUTO_SYNC_ENABLED=true` and `SYNCFY_API_KEY` is set
- **THEN** connect, reconnect, resync and webhook processing behave as before

### Requirement: Web hides unavailable bank-sync actions

The web app SHALL treat a provider as actionable only when the connectors list contains it. When it is not, the Accounts screens SHALL disable the "Sync accounts" option and SHALL replace Resync and Reconnect with "Bank synchronization is currently unavailable." The web app SHALL NOT offer an upgrade action. The server SHALL enforce the rule regardless of the client.

#### Scenario: Synced account while unavailable

- **WHEN** connectors are empty and a user opens a synced account
- **THEN** its sync status and metadata are shown, Resync and Reconnect are not offered, and the unavailable message is shown

## REMOVED Requirements

### Requirement: Manual sync is independent of the flag

**Reason**: Syncfy credits are exhausted, so the flag must stop every credit-spending Syncfy operation, not only the scheduler.

**Migration**: Set `SYNCFY_AUTO_SYNC_ENABLED=true` (with `SYNCFY_API_KEY`) wherever manual Syncfy must keep working.
