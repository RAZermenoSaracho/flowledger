## ADDED Requirements

### Requirement: Test Postgres containers leave no volumes
The API integration and e2e test database container SHALL keep its data directory on tmpfs so that no anonymous Docker volume is created, even if the container is never removed.

#### Scenario: No volume while running
- **WHEN** `startTestDatabase()` has resolved
- **THEN** the Docker host lists no volume created for that container

### Requirement: Test Postgres containers have a bounded lifetime
The API integration and e2e test database container SHALL stop itself after a fixed maximum lifetime of 20 minutes, so that a container left without a reaper does not keep running.

#### Scenario: Unreaped container stops
- **WHEN** a test Postgres container has been running for 20 minutes without being stopped by its test process or a reaper
- **THEN** the container is in the exited state

#### Scenario: Normal startup is unaffected
- **WHEN** `startTestDatabase()` is called
- **THEN** it resolves with a working connection URI and migrations applied

### Requirement: Interrupted runs are reaped
A killed or aborted API test run SHALL leave no container labelled `org.testcontainers=true` and no volume on the Docker host within 2 minutes, while the reaper container is alive.

#### Scenario: SIGKILL mid-run
- **WHEN** the vitest process tree of an integration test file is SIGKILLed after the Postgres container is up
- **THEN** within 2 minutes the Docker host lists zero testcontainers containers and zero volumes

#### Scenario: Complete run
- **WHEN** the full `apps/api` test run finishes
- **THEN** the Docker host lists zero testcontainers containers and zero volumes

### Requirement: Leftovers are discoverable without automation
`docs/TESTING.md` SHALL document a read-only command that lists leftover testcontainers containers and volumes on the Docker host, state the situations in which the reaper cannot cover a run, and describe removal as a manual per-id step. No script SHALL remove containers or volumes automatically.

#### Scenario: Listing leftovers
- **WHEN** a developer runs the documented listing command
- **THEN** it prints each `org.testcontainers=true` container with its state and session id, and each volume, and changes nothing
