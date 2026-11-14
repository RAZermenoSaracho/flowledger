# Spec Delta

## ADDED Requirements

### Requirement: Ingest-only API keys

Key creation SHALL accept `ingestOnly`. An ingest-only key SHALL have the scopes `["ingest"]`. Combining `ingestOnly` with write access SHALL fail with 400. Ingest-only keys SHALL be listed like other keys, with their scopes shown.

#### Scenario: Create ingest-only key
- **WHEN** a user creates a key with `ingestOnly: true`
- **THEN** the key is created with scopes `["ingest"]` and the secret is shown once

#### Scenario: Ingest with write
- **WHEN** a user creates a key with `ingestOnly: true` and write access
- **THEN** the response is 400 and no key is created

#### Scenario: Listing
- **WHEN** the user lists keys
- **THEN** the ingest-only key appears with scope `ingest`

### Requirement: Ingest scope isolation

The ingest scope SHALL satisfy only routes that require ingest. Read and write keys SHALL get 403 on ingest routes. Ingest keys SHALL get 403 on every route requiring read or write. OAuth grants SHALL never receive the ingest scope.

#### Scenario: Ingest key on ingest route
- **WHEN** an ingest key calls the notification ingest route
- **THEN** it is authorized

#### Scenario: Read or write key on ingest route
- **WHEN** a read or write key calls the ingest route
- **THEN** the response is 403

#### Scenario: Ingest key elsewhere
- **WHEN** an ingest key calls any read or write route
- **THEN** the response is 403

#### Scenario: OAuth
- **WHEN** an OAuth grant is issued or requests the ingest scope
- **THEN** the grant does not include it
