# syncfy-auto-sync Specification

## Purpose
Defines how the Syncfy background scheduler is enabled by configuration.

## Requirements

### Requirement: Explicit auto-sync flag parsing

`SYNCFY_AUTO_SYNC_ENABLED` SHALL be parsed case-insensitively, ignoring surrounding whitespace. `true` and `1` SHALL enable the scheduler. `false`, `0`, an empty value, and an unset variable SHALL disable it. Any other value SHALL fail startup with a validation error naming the variable.

#### Scenario: Explicit false

- **WHEN** the API starts with `SYNCFY_AUTO_SYNC_ENABLED=false`
- **THEN** the scheduler does not start and no scheduled Syncfy request is made

#### Scenario: Enabled

- **WHEN** the API starts with `SYNCFY_AUTO_SYNC_ENABLED=TRUE`
- **THEN** the scheduler starts

#### Scenario: Unset or empty

- **WHEN** the variable is unset or empty
- **THEN** the scheduler does not start

#### Scenario: Invalid value

- **WHEN** the variable is `yes`
- **THEN** startup fails with a validation error

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

### Requirement: Web shows unavailable bank-sync actions as disabled

The web app SHALL treat a provider as actionable only when the connectors list contains it. When it is not, the Accounts screens SHALL behave as follows:

- They SHALL keep the provider actions visible but disabled: Sync accounts, discovered-accounts refresh, Resync and Reconnect.
- Each disabled action SHALL carry the tooltip "Bank synchronization is temporarily unavailable." The tooltip SHALL be reachable by keyboard focus, mouse hover and tap, and announced to assistive technology.
- They SHALL show the notice "Bank connections and synchronization are temporarily disabled. Your existing accounts and transactions remain available."
- They SHALL make no provider request and SHALL NOT load the provider widget.
- They SHALL NOT show stored provider failure text or a reconnect call to action.
- They SHALL NOT offer an upgrade action.

The server SHALL enforce the rule regardless of the client.

#### Scenario: Synced account while unavailable

- **WHEN** connectors are empty and a user opens a synced account
- **THEN** its sync status and metadata are shown, Resync and Reconnect are present and disabled with the tooltip, the notice is shown, and no stored failure text is shown

#### Scenario: Keyboard and touch

- **WHEN** a keyboard user tabs to a disabled Resync, or a touch user taps it
- **THEN** the tooltip appears, no request is sent, and Escape or moving focus away closes it
