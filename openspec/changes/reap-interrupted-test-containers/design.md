## Context

`startTestDatabase()` starts one `postgres:16-alpine` container per integration/e2e file (44 files). Vitest 4 runs each file in a forked process (default pool `forks`, `maxWorkers: 2`). testcontainers 12.2.1 starts a Ryuk reaper (`testcontainers/ryuk:0.14.0`) under a file lock; later processes reuse the running Ryuk and register their session id (`org.testcontainers.session-id` label) over a TCP socket. When all sockets close, Ryuk waits 10 s (`reconnection_timeout`), then removes every container, network and volume carrying the session label, and exits.

## Evidence (docker-test-vm, one small file, `DOCKER_HOST` and `TESTCONTAINERS_HOST_OVERRIDE` set)

Proven by repro:
- SIGKILL of the whole vitest process tree after Postgres is up: Postgres, Ryuk and the anonymous volume were gone about 15 s later (counts back to 0/0).
- SIGKILL as soon as Ryuk appears: same result.
- SIGKILL of only the top-level vitest process (forks left alone): same result.
- Run 2 started while run 1's Ryuk was still draining, then killed: reaped, 0/0. No stale-Ryuk reuse race was observed.
- Ryuk verbose log of a killed run: `client connected` with the session filter, `client disconnected` at the kill, `prune check clients=0` 10 s later, `removed containers=1`, `done`. The host override to 192.168.56.20 works for the socket.
- Ryuk is created with `HostConfig.AutoRemove=true`; the Postgres container is not (`withAutoRemove` in testcontainers is only the client-side remove-on-stop flag, not the Docker flag).
- Postgres data dir on tmpfs (`withTmpFs`) leaves no volume while running and none after stop.

Inferred, not reproduced (reproducing needs the VM to stop, which this investigation must not do):
- Leftover sessions with exit 137, `OOMKilled=false` and no Ryuk match a VM stop or reboot: the daemon SIGKILLs containers after its grace period, `AutoRemove` removes Ryuk, and the Postgres container stays `Exited (137)` with its anonymous volume. Nothing restarts Ryuk, so nothing reaps them.
- The single Ryuk stuck in `Created` and the `context canceled` containers match a client killed between container create and start; the window is milliseconds and was not hit in 4 attempts.
- Hook timeouts and a failed `beforeAll` do not persist a container: `container` is assigned right after `start()`, so `afterAll` stops it, and if `start()` outlives the 180 s hook timeout Ryuk still reaps it when the process exits.

## Decisions

1. **Keep Ryuk, add no reaper code.** It works; the gaps are outside what Ryuk can cover.
2. **Postgres data on tmpfs** via `.withTmpFs({ "/var/lib/postgresql/data": "rw" })` in the helper. Removes the volume leak class in one line; the data is throwaway by design. Cost: the data lives in VM RAM; test databases are tens of MB and at most two run at once (`maxWorkers: 2`).
3. **Document, do not automate, leftover cleanup.** A read-only `curl` listing of `org.testcontainers=true` containers and volumes, and a per-id removal step run by a human. Destructive operations need approval and never run automatically.
4. **Rejected: vitest `globalSetup` with one container and per-file databases.** The evidence does not show per-file containers cause the leak; Ryuk handles all 44. It would rewrite the helper contract used by 44 files, need a template-database step and weaken per-file isolation. Its benefit is lower load, which belongs to #193 if wanted.
5. **Rejected: forcing Docker `AutoRemove` onto Postgres** (testcontainers has no public API for it) and **disabling Ryuk** (removes the working safety net).

## Risks

- tmpfs uses VM RAM (2 GB). Mitigation: acceptance requires the full API suite to pass with unchanged results and no hook timeouts.
- The VM-stop path stays documented only; leftovers can still appear after a VM stop, but without volumes.

## Open questions

- Owner decision: is a documented manual listing sufficient, or should a `scripts/` helper wrap it? Default: documentation only.
