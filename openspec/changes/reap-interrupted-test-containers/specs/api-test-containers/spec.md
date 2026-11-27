## ADDED Requirements

### Requirement: Interrupted runs are reaped
A killed or aborted API test run SHALL leave no container labelled `org.testcontainers=true` and no volume on the Docker test host within 2 minutes, while the run's reaper container is alive.

#### Scenario: SIGKILL mid-run
- **WHEN** the vitest process tree of an integration test file is SIGKILLed after the Postgres container is up
- **THEN** within 2 minutes the Docker host lists zero testcontainers containers and zero volumes

#### Scenario: Complete run
- **WHEN** the full `apps/api` test run finishes
- **THEN** the Docker host lists zero testcontainers containers and zero volumes

### Requirement: Orphaned testcontainers are swept conservatively
The Docker test host SHALL run a periodic sweep that removes a container only when it carries the label `org.testcontainers=true`, is not a running Ryuk, is older than 3 hours, and, if running, has no running Ryuk container with the same `org.testcontainers.session-id`. The sweep SHALL remove only those containers and their anonymous volumes, SHALL NOT prune volumes, networks, images or unlabelled containers, and SHALL list without removing unless explicitly applied.

#### Scenario: Orphan removed
- **WHEN** a labelled Postgres container has been running for more than 3 hours and no Ryuk with its session id is running
- **THEN** the sweep removes it and its anonymous volume and logs the removal

#### Scenario: Live run untouched
- **WHEN** a labelled container is younger than 3 hours, or its session has a running Ryuk
- **THEN** the sweep leaves it running

#### Scenario: Unrelated workload untouched
- **WHEN** a container has no `org.testcontainers=true` label, whatever its state or age
- **THEN** the sweep neither removes nor lists it

#### Scenario: Default is read-only
- **WHEN** the sweep runs without the apply flag
- **THEN** it prints the containers it would remove and removes nothing

### Requirement: Leftovers are documented
`docs/TESTING.md` SHALL describe the sweep, its selection rule, a read-only command that lists leftover testcontainers containers and volumes, and that nothing in the repository removes containers or volumes.

#### Scenario: Listing leftovers
- **WHEN** a developer runs the documented listing command
- **THEN** it prints each `org.testcontainers=true` container with its state and session id, and each volume, and changes nothing
