## Why

Odoo #196: 34 Postgres testcontainers and 28 anonymous volumes (about 1.14 GB) accumulated on the docker-test-vm between Nov 11 and Nov 23. Five containers of one session were still running three days later while the VM had stayed up, so a reaper was absent for that session. Investigation (see `design.md`) shows Ryuk reaps correctly in every killed-run variant we could reproduce, and shows that a run only creates containers after it has connected to a reaper. The leak therefore needs Ryuk (or its port proxy) to disappear while the test process lives on, and the testcontainers client never notices or recovers. The exact trigger is not proven. The change makes the damage bounded regardless of the trigger: a leaked container cannot keep running or hold a volume, and leftovers are easy to find.

## What Changes

- The test Postgres container keeps its data on tmpfs, so a leftover container never leaves an anonymous volume behind.
- The test Postgres container stops itself after a fixed maximum lifetime (20 minutes, far above the longest test file), so a container whose reaper is gone cannot keep running for days and occupying the 2 GB VM's memory.
- `docs/TESTING.md` documents how reaping works, which situations it cannot cover, and a read-only command that lists leftover testcontainers containers and volumes, plus the manual per-id removal step.
- The reaping behavior is verified (SIGKILL mid-run and a full API run leave nothing) and the result is recorded in the Odoo task.

Out of scope: a vitest `globalSetup` with one shared container (rejected, see design), VM sizing, memory pressure and Node/host stability (#193), automatic pruning, Ryuk timeout tuning (no timeout path was found that applies).

## Capabilities

### New Capabilities
- `api-test-containers`: lifecycle guarantees for Postgres testcontainers used by API integration and e2e tests.

### Modified Capabilities

None.

## Impact

- `apps/api/src/tests/helpers/testDatabase.ts` (three builder calls and one constant).
- `docs/TESTING.md`.
- No production code, no schema, no new dependency, no new environment variable.
