## Why

Odoo #196: 34 Postgres testcontainers and 28 anonymous volumes (about 1.14 GB) accumulated on docker-test-vm between Nov 11 and Nov 23; five containers of one session were still running three days later while the VM stayed up. Investigation (see `design.md`) shows Ryuk reaps correctly in every killed-run variant we could reproduce, so the leak needs Ryuk to disappear while the test process lives on, and nothing in the testcontainers client recovers from that. The exact trigger is not proven. This is a property of the Docker host, not of FlowLedger code, so the fix belongs on the host: a small, conservative sweep on docker-test-vm that removes only testcontainers leftovers whose reaper is gone.

## What Changes

- **On docker-test-vm (outside this repository, in `~/scripts/docker-test-vm`):** a sweep script plus an hourly systemd timer that removes containers labelled `org.testcontainers=true` only when they are old and have no live Ryuk, with the selection rule defined in `design.md`. The script lists by default and removes only with `--apply`.
- **In this repository:** `docs/TESTING.md` documents the sweep, its selection rule, the read-only listing command, and that nothing in the repo removes containers.
- **No application, API, frontend, schema or test-helper change.** The earlier idea of a tmpfs data dir and a self-terminating Postgres entrypoint in `testDatabase.ts` is dropped: the sweep removes containers with `-v`, which covers the volumes, and runs on the host that owns the problem.

Out of scope: a vitest `globalSetup` with one shared container, VM sizing and memory pressure (#193), Ryuk timeout tuning (no applicable timeout path), anything that stops or removes containers of a live run.

## Capabilities

### New Capabilities
- `api-test-containers`: what the Docker test host guarantees about leftover testcontainers, and how API test runs are verified against it.

### Modified Capabilities

None.

## Impact

- Outside the repo: `~/scripts/docker-test-vm/Vagrantfile` (one extra provisioner), a new sweep script and two systemd unit files in the same folder. Applying them to the running VM is a separate, owner-approved step that must not restart dockerd.
- In the repo: `docs/TESTING.md` only.
- Tracking: see `design.md` (Tracking).
