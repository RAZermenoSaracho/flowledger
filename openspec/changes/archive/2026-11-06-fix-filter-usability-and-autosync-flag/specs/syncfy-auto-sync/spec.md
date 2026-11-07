# Spec Delta

## Purpose

Defines how the Syncfy background scheduler is enabled by configuration.

## ADDED Requirements

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

### Requirement: Manual sync is independent of the flag

Disabling the scheduler SHALL NOT disable user-initiated Syncfy refreshes or webhook processing.

#### Scenario: Manual resync with the scheduler disabled

- **WHEN** `SYNCFY_AUTO_SYNC_ENABLED=false` and a user requests a resync
- **THEN** the resync runs
