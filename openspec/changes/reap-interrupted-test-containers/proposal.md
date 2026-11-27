## Why

Odoo #196: 34 Postgres testcontainers and 28 anonymous volumes (about 1.14 GB) accumulated on the docker-test-vm between Nov 11 and Nov 23, from interrupted API integration runs. Investigation (see `design.md`) shows Ryuk does reap the containers and volumes of a SIGKILLed vitest run within about 15 seconds. The leftovers therefore come from paths Ryuk cannot cover: the VM stopping (Ryuk is created with `AutoRemove` and disappears with the daemon, the Postgres container does not) and a client killed between creating and starting Ryuk. The one part of the leak that code can prevent is the anonymous data volume; the rest needs a documented, read-only way to find leftovers.

## What Changes

- The test Postgres container keeps its data directory on tmpfs, so a leftover container can never leave an anonymous volume behind.
- `docs/TESTING.md` documents how Ryuk reaps, which interruptions it cannot cover, and a read-only command that lists leftover testcontainers (containers and volumes) on the VM, plus the manual per-id removal step.
- The reaping behavior is verified (SIGKILL mid-run leaves nothing within 2 minutes; a full API run leaves nothing) and the result is recorded in the Odoo task, not in new code.

Out of scope: a vitest `globalSetup` with one shared container and per-file databases (rejected, see design), VM sizing and Node/host stability (#193), automatic pruning.

## Capabilities

### New Capabilities
- `api-test-containers`: lifecycle guarantees for Postgres testcontainers used by API integration and e2e tests.

### Modified Capabilities

None.

## Impact

- `apps/api/src/tests/helpers/testDatabase.ts` (one builder call).
- `docs/TESTING.md`.
- No production code, no schema, no new dependency, no new environment variable.
